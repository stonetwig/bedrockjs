/**
 * `defineSyncedModel` — creates a typed, locally-persisted, server-synced
 * collection of records. Returns a Model with create/update/delete/get/all/where
 * plus a reactive collection for direct use in templates.
 */

import { reactive } from "../reactive.js";
import {
  applyServerRow,
  deleteOutboxEntries,
  getAll as idbGetAll,
  getCursor as idbCursor,
  openDb,
  readOutbox,
  writeWithOutbox,
} from "./indexeddb.js";
import { makeOpId, now } from "./protocol-runtime.js";

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
  const dbName = ctx.dbName || "bedrockjs-sync";

  // Reactive view: array of public records, plus an id index for fast lookup.
  const collection = reactive(/** @type {any[]} */ ([]));
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {Map<string, any>} */
  const rowsById = new Map();

  function publicView(row) {
    // Strip internal metadata; expose data + id + rev.
    return { id: row.id, rev: row.rev, ...row.data };
  }

  function upsertLocal(row) {
    if (row.deletedAt) {
      rowsById.set(row.id, row);
      const existing = byId.get(row.id);
      if (!existing) return;
      byId.delete(row.id);
      const idx = collection.findIndex((r) => r.id === row.id);
      if (idx >= 0) collection.splice(idx, 1);
      return;
    }
    rowsById.set(row.id, row);
    const view = publicView(row);
    const existing = byId.get(row.id);
    if (existing) {
      // Mutate properties in place so reactive watchers fire on each property.
      for (const key of Object.keys(view)) {
        if (existing[key] !== view[key]) {
          existing[key] = view[key];
        }
      }
      // Remove keys no longer present
      for (const key of Object.keys(existing)) {
        if (!(key in view)) {
          delete existing[key];
        }
      }
    } else {
      collection.push(view);
      byId.set(row.id, collection[collection.length - 1]);
    }
  }

  async function withDb(operation) {
    try {
      return await operation(await openDb(dbName, [name]));
    } catch (err) {
      if (!isRetryableIdbError(err)) throw err;
      return await operation(await openDb(dbName, [name]));
    }
  }

  // Initial hydration from IDB.
  const ready = (async () => {
    const rows = await withDb((db) => idbGetAll(db, name));
    for (const r of rows) upsertLocal(r);
  })();

  /**
   * Build a local optimistic Row from user-supplied data.
   * Server will confirm rev/serverTs when the row is accepted.
   */
  function buildLocalRow(id, data) {
    const ts = now();
    const fieldTs = {};
    for (const k of Object.keys(data)) fieldTs[k] = ts;
    return { id, rev: 0, serverTs: ts, fieldTs, data };
  }

  async function create(input) {
    if (!input || typeof input.id !== "string") {
      throw new Error(`${name}.create: 'id' (string) is required`);
    }
    await ready;
    const data = pickFields(schema, input);
    const row = buildLocalRow(input.id, data);
    const op = {
      opId: makeOpId(),
      type: "create",
      model: name,
      id: input.id,
      data,
      clientTs: row.serverTs,
    };
    upsertLocal(row);
    await withDb((db) => writeWithOutbox(db, name, row, null, op));
    ctx.client.scheduleDrain(0);
    return publicView(row);
  }

  async function update(id, patch) {
    await ready;
    const existing = byId.get(id);
    if (!existing) throw new Error(`${name}.update: no record ${id}`);
    const existingRow = rowsById.get(id);
    const cleanPatch = pickFields(schema, patch);
    const ts = now();
    // Reconstruct full row from public view + new patch.
    const newData = {
      ...(existingRow?.data ?? stripPublic(existing)),
      ...cleanPatch,
    };
    const fieldTs = { ...(existingRow?.fieldTs ?? {}) };
    for (const k of Object.keys(cleanPatch)) fieldTs[k] = ts;
    const row = {
      id,
      rev: existingRow?.rev ?? existing.rev ?? 0,
      serverTs: ts,
      fieldTs,
      data: newData,
    };
    upsertLocal(row);
    const op = {
      opId: makeOpId(),
      type: "update",
      model: name,
      id,
      patch: cleanPatch,
      clientTs: ts,
    };
    await withDb((db) => writeWithOutbox(db, name, row, null, op));
    ctx.client.scheduleDrain(0);
    return publicView(row);
  }

  async function del(id) {
    await ready;
    const existing = byId.get(id);
    if (!existing) return;
    const existingRow = rowsById.get(id);
    const ts = now();
    const tombstone = {
      id,
      rev: existingRow?.rev ?? existing.rev ?? 0,
      serverTs: ts,
      fieldTs: existingRow?.fieldTs ?? {},
      deletedAt: ts,
      data: existingRow?.data ?? stripPublic(existing),
    };
    upsertLocal(tombstone);
    const op = {
      opId: makeOpId(),
      type: "delete",
      model: name,
      id,
      clientTs: ts,
    };
    await withDb((db) => writeWithOutbox(db, name, tombstone, null, op));
    ctx.client.scheduleDrain(0);
  }

  function get(id) {
    const item = byId.get(id);
    if (item) return item;
    // Ensure renders that call get() while the row does not exist yet still
    // subscribe to collection growth (e.g. first server/IDB hydration insert).
    void collection.length;
    return undefined;
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
      const applied = await withDb((db) =>
        applyServerRow(db, name, row, cursor)
      );
      upsertLocal(applied);
      notify();
    },
    getCursor: async () => {
      return await withDb((db) => idbCursor(db, name));
    },
    getOutbox: async () => {
      const all = await withDb((db) => readOutbox(db));
      return all.filter((e) => e.op.model === name);
    },
    ackOutbox: async (seqs) => {
      await withDb((db) => deleteOutboxEntries(db, seqs));
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
    if (k === "id" || k === "rev") continue;
    if (k in input) {
      let v = input[k];
      if (kind === "datetime" && v instanceof Date) v = v.toISOString();
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

function isRetryableIdbError(err) {
  const name = err && typeof err === "object" ? err.name : "";
  return name === "InvalidStateError" || name === "NotFoundError";
}
