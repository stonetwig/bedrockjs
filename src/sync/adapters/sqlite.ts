/**
 * SQLite storage adapter for BedrockJS sync.
 *
 * Built on `jsr:@db/sqlite` (Deno-native, pure Wasm/FFI).
 *
 * Schema (single shared file):
 *   bedrockjs_rows(scope, model, id PRIMARY KEY (scope, model, id), data JSON)
 *   bedrockjs_log(seq INTEGER PRIMARY KEY AUTOINCREMENT, scope, model, id, data JSON)
 *   bedrockjs_cursor(scope, model, value, PRIMARY KEY (scope, model))
 *   bedrockjs_ops(scope, model, op_id, cursor, expires_at, PRIMARY KEY (scope, model, op_id))
 */

import { Database } from 'jsr:@db/sqlite@0.12';
import type { Row, Change } from '../protocol.ts';
import type { StorageAdapter } from './types.ts';

export interface SqliteAdapterOptions {
  /** Path to the SQLite database file. Use ':memory:' for in-process. */
  path: string;
  /** Op-dedupe TTL in ms. Default: 24h. */
  opTtlMs?: number;
}

export function sqliteAdapter(opts: SqliteAdapterOptions): StorageAdapter {
  const opTtlMs = opts.opTtlMs ?? 24 * 60 * 60 * 1000;
  let db: Database | null = null;

  function open(): Database {
    if (!db) throw new Error('sqliteAdapter not initialized');
    return db;
  }

  return {
    init(_models) {
      // int64:true so large millisecond timestamps don't get truncated to i32.
      db = new Database(opts.path, { int64: true });
      db.exec(`
        CREATE TABLE IF NOT EXISTS bedrockjs_rows (
          scope TEXT NOT NULL,
          model TEXT NOT NULL,
          id    TEXT NOT NULL,
          data  TEXT NOT NULL,
          PRIMARY KEY (scope, model, id)
        );
        CREATE TABLE IF NOT EXISTS bedrockjs_log (
          seq   INTEGER PRIMARY KEY AUTOINCREMENT,
          scope TEXT NOT NULL,
          model TEXT NOT NULL,
          id    TEXT NOT NULL,
          data  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS bedrockjs_log_by_scope_model
          ON bedrockjs_log (scope, model, seq);
        CREATE TABLE IF NOT EXISTS bedrockjs_cursor (
          scope TEXT NOT NULL,
          model TEXT NOT NULL,
          value INTEGER NOT NULL,
          PRIMARY KEY (scope, model)
        );
        CREATE TABLE IF NOT EXISTS bedrockjs_ops (
          scope      TEXT NOT NULL,
          model      TEXT NOT NULL,
          op_id      TEXT NOT NULL,
          cursor     INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY (scope, model, op_id)
        );
      `);
      return Promise.resolve();
    },

    get(scope, model, id) {
      const row = open().prepare(
        'SELECT data FROM bedrockjs_rows WHERE scope = ? AND model = ? AND id = ?',
      ).get<{ data: string }>(scope, model, id);
      return Promise.resolve(row ? (JSON.parse(row.data) as Row) : null);
    },

    appendChange(scope, model, row) {
      const d = open();
      let cursor = 0;
      d.transaction(() => {
        // Insert into the log first; its auto-increment seq is the cursor.
        // We need to know the seq before serializing the row (since `rev` ==
        // cursor), so we insert a placeholder then update.
        const placeholder = JSON.stringify({ ...row, rev: 0 });
        d.prepare(
          'INSERT INTO bedrockjs_log (scope, model, id, data) VALUES (?, ?, ?, ?)',
        ).run(scope, model, row.id, placeholder);
        cursor = Number(d.lastInsertRowId);
        const stamped: Row = { ...row, rev: cursor };
        const json = JSON.stringify(stamped);
        d.prepare(
          'UPDATE bedrockjs_log SET data = ? WHERE seq = ?',
        ).run(json, cursor);
        d.prepare(
          `INSERT INTO bedrockjs_cursor (scope, model, value) VALUES (?, ?, ?)
           ON CONFLICT(scope, model) DO UPDATE SET value = excluded.value`,
        ).run(scope, model, cursor);
        d.prepare(
          `INSERT INTO bedrockjs_rows (scope, model, id, data) VALUES (?, ?, ?, ?)
           ON CONFLICT(scope, model, id) DO UPDATE SET data = excluded.data`,
        ).run(scope, model, row.id, json);
      })();
      return Promise.resolve(cursor);
    },

    async *list(scope, model) {
      const rows = open().prepare(
        'SELECT data FROM bedrockjs_rows WHERE scope = ? AND model = ?',
      ).all<{ data: string }>(scope, model);
      for (const r of rows) {
        const parsed = JSON.parse(r.data) as Row;
        if (!parsed.deletedAt) yield parsed;
      }
    },

    async *changesSince(scope, model, since) {
      const rows = open().prepare(
        `SELECT seq, data FROM bedrockjs_log
         WHERE scope = ? AND model = ? AND seq > ?
         ORDER BY seq ASC`,
      ).all<{ seq: number; data: string }>(scope, model, since);
      for (const r of rows) {
        const row = JSON.parse(r.data) as Row;
        const change: Change = { cursor: r.seq, model, id: row.id, row };
        yield change;
      }
    },

    currentCursor(scope, model) {
      const r = open().prepare(
        'SELECT value FROM bedrockjs_cursor WHERE scope = ? AND model = ?',
      ).get<{ value: number }>(scope, model);
      return Promise.resolve(r?.value ?? 0);
    },

    rememberedOp(scope, model, opId) {
      const d = open();
      const r = d.prepare(
        `SELECT cursor, expires_at FROM bedrockjs_ops
         WHERE scope = ? AND model = ? AND op_id = ?`,
      ).get<{ cursor: number; expires_at: bigint | number }>(scope, model, opId);
      if (!r) return Promise.resolve(null);
      if (Number(r.expires_at) < Date.now()) {
        d.prepare(
          'DELETE FROM bedrockjs_ops WHERE scope = ? AND model = ? AND op_id = ?',
        ).run(scope, model, opId);
        return Promise.resolve(null);
      }
      // Look up the row at that cursor in the log.
      const log = d.prepare(
        'SELECT data FROM bedrockjs_log WHERE scope = ? AND model = ? AND seq = ?',
      ).get<{ data: string }>(scope, model, r.cursor);
      if (!log) return Promise.resolve(null);
      return Promise.resolve({
        row: JSON.parse(log.data) as Row,
        cursor: r.cursor,
      });
    },

    rememberOp(scope, model, opId, _row, cursor) {
      // Bind expires_at as BigInt: @db/sqlite truncates large JS Numbers.
      const expires = BigInt(Date.now() + opTtlMs);
      open().prepare(
        `INSERT INTO bedrockjs_ops (scope, model, op_id, cursor, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope, model, op_id) DO UPDATE SET cursor = excluded.cursor, expires_at = excluded.expires_at`,
      ).run(scope, model, opId, cursor, expires);
      return Promise.resolve();
    },

    close() {
      if (db) {
        db.close();
        db = null;
      }
    },
  };
}
