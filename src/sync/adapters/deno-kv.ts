/**
 * Deno KV storage adapter for BedrockJS sync.
 *
 * Key layout (per scope, per model):
 *   ['bedrockjs', scope, model, 'row', id]      → Row
 *   ['bedrockjs', scope, model, 'log', cursor]  → Row (change at this cursor)
 *   ['bedrockjs', scope, model, 'cursor']       → number  (monotonic counter)
 *   ['bedrockjs', scope, model, 'op', opId]     → { cursor: number }
 */

/// <reference lib="deno.unstable" />

import type { Row, Change } from '../protocol.ts';
import type { StorageAdapter } from './types.ts';

export interface DenoKvAdapterOptions {
  /** Existing Deno.Kv instance. If omitted, the adapter will open one. */
  kv?: Deno.Kv;
  /** Path passed to Deno.openKv() if `kv` is not provided. */
  path?: string;
  /** Op-dedupe TTL in ms. Default: 24h. */
  opTtlMs?: number;
}

export function denoKvAdapter(opts: DenoKvAdapterOptions = {}): StorageAdapter {
  let kv: Deno.Kv | null = opts.kv ?? null;
  let owned = false;
  const opTtlMs = opts.opTtlMs ?? 24 * 60 * 60 * 1000;

  const ROOT = 'bedrockjs';

  function rowKey(scope: string, model: string, id: string) {
    return [ROOT, scope, model, 'row', id];
  }
  function logKey(scope: string, model: string, cursor: number) {
    return [ROOT, scope, model, 'log', cursor];
  }
  function cursorKey(scope: string, model: string) {
    return [ROOT, scope, model, 'cursor'];
  }
  function opKey(scope: string, model: string, opId: string) {
    return [ROOT, scope, model, 'op', opId];
  }

  return {
    async init(_models) {
      if (!kv) {
        kv = await Deno.openKv(opts.path);
        owned = true;
      }
    },

    async get(scope, model, id) {
      const r = await kv!.get<Row>(rowKey(scope, model, id));
      return r.value ?? null;
    },

    async appendChange(scope, model, row) {
      // Optimistic-concurrency loop on the cursor counter.
      // We use Deno KV's atomic() with a `check` on the current cursor.
      while (true) {
        const cursorEntry = await kv!.get<number>(cursorKey(scope, model));
        const current = cursorEntry.value ?? 0;
        const next = current + 1;
        const stamped: Row = { ...row, rev: next };
        const tx = kv!.atomic()
          .check(cursorEntry)
          .set(cursorKey(scope, model), next)
          .set(rowKey(scope, model, row.id), stamped)
          .set(logKey(scope, model, next), stamped);
        const res = await tx.commit();
        if (res.ok) return next;
      }
    },

    async *list(scope, model) {
      const prefix = [ROOT, scope, model, 'row'];
      for await (const entry of kv!.list<Row>({ prefix })) {
        if (entry.value && !entry.value.deletedAt) yield entry.value;
      }
    },

    async *changesSince(scope, model, since) {
      const prefix = [ROOT, scope, model, 'log'];
      const start = [...prefix, since + 1];
      for await (const entry of kv!.list<Row>({ prefix, start })) {
        const cursor = entry.key[entry.key.length - 1] as number;
        const row = entry.value;
        if (!row) continue;
        const change: Change = { cursor, model, id: row.id, row };
        yield change;
      }
    },

    async currentCursor(scope, model) {
      const c = await kv!.get<number>(cursorKey(scope, model));
      return c.value ?? 0;
    },

    async rememberedOp(scope, model, opId) {
      const e = await kv!.get<{ cursor: number }>(opKey(scope, model, opId));
      if (!e.value) return null;
      const log = await kv!.get<Row>(logKey(scope, model, e.value.cursor));
      if (!log.value) return null;
      return { row: log.value, cursor: e.value.cursor };
    },

    async rememberOp(scope, model, opId, _row, cursor) {
      await kv!.set(opKey(scope, model, opId), { cursor }, {
        expireIn: opTtlMs,
      });
    },

    async close() {
      if (owned && kv) {
        kv.close();
        kv = null;
      }
    },
  };
}
