/**
 * `defineSyncedModel` — creates a typed, locally-persisted, server-synced
 * collection of records. Returns a Model with create/update/delete/get/all/where
 * plus a reactive collection for direct use in templates.
 */

import { reactive } from '../reactive.js';
import {
  openDb,
  writeWithOutbox,
  applyServerRow,
  getCursor as idbCursor,
  getAll as idbGetAll,
  readOutbox,
  deleteOutboxEntries,
} from './indexeddb.js';
import { makeOpId, now } from './protocol-runtime.js';

/**
 * @typedef {'string'|'number'|'boolean'|'datetime'} FieldKind
 * @typedef {{ fields: Record<string, FieldKind> }} ModelSchema
 */

/**
 * @param {string} name
 * @param {ModelSchema} schema
 * @param {{ client: any, dbName?: string }} ctx
 */
export function defineSyncedModel(name, schema, ctx) {
  const dbName = ctx.dbName || 'bedrockjs-sync';
  const dbPromise = openDb(dbName, [name]);

  // Reactive view: array of public records, plus an id index for fast lookup.
  const collection = reactive(/** @type {any[]} */ ([]));
  /** @type {Map<string, any>} */
  const byId = new Map();

  function publicView(row) {
    // Strip internal metadata; expose data + id + rev.
    return { id: row.id, rev: row.rev, ...row.data };
  }

  function upsertLocal(row) {
    if (row.deletedAt) {
      const existing = byId.get(row.id);
      if (!existing) return;
      byId.delete(row.id);
      const idx = collection.findIndex((r) => r.id === row.id);
      if (idx >= 0) collection.splice(idx, 1);
      return;
    }
    const view = publicView(row);
    const existing = byId.get(row.id);
    if (existing) {
      // Mutate in place so reactive watchers fire on each property.
      const idx = collection.findIndex((r) => r.id === row.id);
      if (idx >= 0) {
        // Replace the entire item to update reactive proxy children.
        collection[idx] = view;
      }
      byId.set(row.id, collection[idx >= 0 ? idx : collection.length - 1]);
    } else {
      collection.push(view);
      byId.set(row.id, collection[collection.length - 1]);
    }
  }

  // Initial hydration from IDB.
  const ready = (async () => {
    const db = await dbPromise;
    const rows = await idbGetAll(db, name);
    for (const r of rows) upsertLocal(r);
  })();

  /**
   * Build a local optimistic Row from user-supplied data.
   * Server will overwrite serverTs/rev/fieldTs on confirmation.
   */
  function buildLocalRow(id, data) {
    const ts = now();
    const fieldTs = {};
    for (const k of Object.keys(data)) fieldTs[k] = ts;
    return { id, rev: 0, serverTs: ts, fieldTs, data };
  }

  async function create(input) {
    if (!input || typeof input.id !== 'string') {
      throw new Error(`${name}.create: 'id' (string) is required`);
    }
    await ready;
    const db = await dbPromise;
    const data = pickFields(schema, input);
    const row = buildLocalRow(input.id, data);
    const op = {
      opId: makeOpId(),
      type: 'create',
      model: name,
      id: input.id,
      data,
      clientTs: row.serverTs,
    };
    upsertLocal(row);
    await writeWithOutbox(db, name, row, null, op);
    ctx.client.scheduleDrain(0);
    return publicView(row);
  }

  async function update(id, patch) {
    await ready;
    const db = await dbPromise;
    const existing = byId.get(id);
    if (!existing) throw new Error(`${name}.update: no record ${id}`);
    const cleanPatch = pickFields(schema, patch);
    const ts = now();
    // Reconstruct full row from public view + new patch.
    const newData = { ...stripPublic(existing), ...cleanPatch };
    const row = {
      id,
      rev: existing.rev || 0,
      serverTs: ts,
      fieldTs: {},
      data: newData,
    };
    for (const k of Object.keys(newData)) row.fieldTs[k] = ts;
    upsertLocal(row);
    const op = {
      opId: makeOpId(),
      type: 'update',
      model: name,
      id,
      patch: cleanPatch,
      clientTs: ts,
    };
    await writeWithOutbox(db, name, row, null, op);
    ctx.client.scheduleDrain(0);
    return publicView(row);
  }

  async function del(id) {
    await ready;
    const db = await dbPromise;
    const existing = byId.get(id);
    if (!existing) return;
    const tombstone = {
      id,
      rev: existing.rev || 0,
      serverTs: now(),
      fieldTs: {},
      deletedAt: now(),
      data: {},
    };
    upsertLocal(tombstone);
    const op = {
      opId: makeOpId(),
      type: 'delete',
      model: name,
      id,
      clientTs: tombstone.serverTs,
    };
    await writeWithOutbox(db, name, null, id, op);
    ctx.client.scheduleDrain(0);
  }

  function get(id) {
    return byId.get(id);
  }

  function all() {
    return collection;
  }

  function where(pred) {
    return collection.filter(pred);
  }

  /** @type {Set<(items: any[]) => void>} */
  const subs = new Set();
  function subscribe(cb) {
    subs.add(cb);
    cb(collection);
    return () => subs.delete(cb);
  }
  function notify() {
    for (const cb of subs) cb(collection);
  }

  // Register with the sync client so server pushes land in the local store.
  ctx.client.registerModel(name, {
    onServerRow: async (row, cursor) => {
      const db = await dbPromise;
      await applyServerRow(db, name, row, cursor);
      upsertLocal(row);
      notify();
    },
    getCursor: async () => {
      const db = await dbPromise;
      return idbCursor(db, name);
    },
    getOutbox: async () => {
      const db = await dbPromise;
      const all = await readOutbox(db);
      return all.filter((e) => e.op.model === name);
    },
    ackOutbox: async (seqs) => {
      const db = await dbPromise;
      await deleteOutboxEntries(db, seqs);
    },
  });

  return {
    name,
    schema,
    ready,
    create,
    update,
    delete: del,
    get,
    all,
    where,
    subscribe,
  };
}

function pickFields(schema, input) {
  const out = {};
  for (const [k, kind] of Object.entries(schema.fields)) {
    if (k === 'id' || k === 'rev') continue;
    if (k in input) {
      let v = input[k];
      if (kind === 'datetime' && v instanceof Date) v = v.toISOString();
      out[k] = v;
    }
  }
  return out;
}

function stripPublic(view) {
  const { id, rev, ...rest } = view;
  void id;
  void rev;
  return rest;
}
