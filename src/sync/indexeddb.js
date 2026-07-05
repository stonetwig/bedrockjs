/**
 * Minimal IndexedDB wrapper for the BedrockJS sync layer.
 *
 * Per database (one per app) we maintain:
 *   - One object store per model (key = id), holding the latest local Row.
 *   - `__outbox__` (auto-increment) holding ordered, unsent ops.
 *   - `__cursor__` (key = model name) holding the highest server cursor seen.
 */

const OUTBOX = "__outbox__";
const CURSOR = "__cursor__";

/**
 * @typedef {{ models: Set<string>, db: IDBDatabase | null, promise: Promise<IDBDatabase> }} DbEntry
 */

/** @type {Map<string, DbEntry>} */
const dbCache = new Map();

/**
 * Open (or upgrade) the IndexedDB database for a given app/model set.
 * Models can be added incrementally — the DB version bumps when a new model is registered.
 *
 * @param {string} dbName
 * @param {string[]} models
 * @returns {Promise<IDBDatabase>}
 */
export function openDb(dbName, models) {
  let entry = dbCache.get(dbName);
  if (!entry) {
    entry = {
      models: new Set(models),
      db: null,
      promise: /** @type {Promise<IDBDatabase>} */ (Promise.resolve(null)),
    };
    entry.promise = openTracked(dbName, entry, undefined);
    dbCache.set(dbName, entry);
    return entry.promise;
  }

  for (const model of models) entry.models.add(model);

  entry.promise = entry.promise
    .catch(() => null)
    .then((db) => ensureStores(db, dbName, entry));
  return entry.promise;
}

/**
 * @param {string} dbName
 * @param {DbEntry} entry
 * @param {number | undefined} version
 */
function openTracked(dbName, entry, version) {
  return openInternal(dbName, [...entry.models], version).then((db) => {
    entry.db = db;
    db.onversionchange = () => {
      closeTracked(entry, db);
    };
    return db;
  });
}

function openInternal(dbName, models, version) {
  return new Promise((resolve, reject) => {
    const req = version === undefined
      ? indexedDB.open(dbName)
      : indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: "seq", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CURSOR)) {
        db.createObjectStore(CURSOR);
      }
      for (const m of models) {
        if (!db.objectStoreNames.contains(m)) {
          db.createObjectStore(m, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn(
        `[bedrockjs/sync] IndexedDB upgrade for "${dbName}" is blocked by another open tab or connection`,
      );
    };
  });
}

/**
 * @param {IDBDatabase | null} db
 * @param {string} dbName
 * @param {DbEntry} entry
 * @returns {Promise<IDBDatabase>}
 */
async function ensureStores(db, dbName, entry) {
  if (!db || entry.db !== db) {
    db = await openTracked(dbName, entry, undefined);
  }

  const models = [...entry.models];
  const missing = models.filter((m) => !db.objectStoreNames.contains(m));
  if (missing.length === 0) return db;
  const newVersion = db.version + 1;
  closeTracked(entry, db);
  try {
    return await openTracked(dbName, entry, newVersion);
  } catch (err) {
    // Another tab may have upgraded first. Reopen the current version, then
    // re-check because it may or may not include the model stores we need.
    if (err && typeof err === "object" && err.name === "VersionError") {
      const current = await openTracked(dbName, entry, undefined);
      return ensureStores(current, dbName, entry);
    }
    throw err;
  }
}

/**
 * @param {DbEntry} entry
 * @param {IDBDatabase} db
 */
function closeTracked(entry, db) {
  if (entry.db === db) entry.db = null;
  db.onversionchange = null;
  db.close();
}

/**
 * Promisify a single IDBRequest.
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

/**
 * Atomically write a row and append an outbox entry.
 * @param {IDBDatabase} db
 * @param {string} model
 * @param {Object|null} row - row to put (or null to delete)
 * @param {string|null} idIfDelete - if row is null, the id to delete
 * @param {Object} op - op to enqueue in outbox
 * @returns {Promise<number>} outbox seq
 */
export function writeWithOutbox(db, model, row, idIfDelete, op) {
  const tx = db.transaction([model, OUTBOX], "readwrite");
  const store = tx.objectStore(model);
  if (row) store.put(row);
  else if (idIfDelete) store.delete(idIfDelete);
  const seqReq = tx.objectStore(OUTBOX).add({ op });
  return Promise.all([reqP(seqReq), txDone(tx)]).then(([seq]) => seq);
}

/**
 * Apply a server-pushed row in-place (no outbox entry).
 * @param {IDBDatabase} db
 * @param {string} model
 * @param {Object} row
 * @param {number} cursor
 * @returns {Promise<Object>}
 */
export function applyServerRow(db, model, row, cursor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([model, CURSOR], "readwrite");
    const store = tx.objectStore(model);
    const cursorStore = tx.objectStore(CURSOR);
    const rowReq = store.get(row.id);
    const cursorReq = cursorStore.get(model);

    let existing = null;
    let currentCursor = 0;
    let gotRow = false;
    let gotCursor = false;
    let applied = row;

    function maybeWrite() {
      if (!gotRow || !gotCursor) return;
      applied = mergeServerRow(existing, row);
      store.put(applied);
      cursorStore.put(Math.max(currentCursor, cursor), model);
    }

    rowReq.onsuccess = () => {
      existing = rowReq.result ?? null;
      gotRow = true;
      maybeWrite();
    };
    cursorReq.onsuccess = () => {
      const value = cursorReq.result;
      currentCursor = typeof value === "number" ? value : 0;
      gotCursor = true;
      maybeWrite();
    };
    tx.oncomplete = () => resolve(applied);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

export async function getCursor(db, model) {
  const tx = db.transaction(CURSOR, "readonly");
  const v = await reqP(tx.objectStore(CURSOR).get(model));
  return typeof v === "number" ? v : 0;
}

export async function getAll(db, model) {
  const tx = db.transaction(model, "readonly");
  return /** @type {any[]} */ (await reqP(tx.objectStore(model).getAll()));
}

export async function getOne(db, model, id) {
  const tx = db.transaction(model, "readonly");
  return await reqP(tx.objectStore(model).get(id));
}

/** @returns {Promise<Array<{seq:number, op:Object}>>} */
export async function readOutbox(db) {
  const tx = db.transaction(OUTBOX, "readonly");
  return /** @type {any} */ (await reqP(tx.objectStore(OUTBOX).getAll()));
}

export async function deleteOutboxEntries(db, seqs) {
  const tx = db.transaction(OUTBOX, "readwrite");
  const store = tx.objectStore(OUTBOX);
  for (const s of seqs) store.delete(s);
  await txDone(tx);
}

export function mergeServerRow(local, server) {
  if (!local) return server;

  const serverWriteTs = latestWriteTs(server);
  const localDeletedAt = local.deletedAt ?? 0;
  if (localDeletedAt > serverWriteTs) {
    return withServerMetadata(local, server);
  }

  if (server.deletedAt) {
    const localWriteTs = latestWriteTs(local);
    if (!local.deletedAt && localWriteTs > server.deletedAt) {
      return mergeLiveRows(local, server);
    }
    return server;
  }

  return mergeLiveRows(local, server);
}

function mergeLiveRows(local, server) {
  const data = { ...(server.data ?? {}) };
  const fieldTs = { ...(server.fieldTs ?? {}) };

  for (const [key, value] of Object.entries(local.data ?? {})) {
    const localTs = local.fieldTs?.[key] ?? 0;
    const serverTs = fieldTs[key] ?? 0;
    if (localTs > serverTs) {
      data[key] = value;
      fieldTs[key] = localTs;
    }
  }

  return {
    id: server.id,
    rev: Math.max(local.rev ?? 0, server.rev ?? 0),
    serverTs: Math.max(local.serverTs ?? 0, server.serverTs ?? 0),
    fieldTs,
    data,
  };
}

function withServerMetadata(local, server) {
  return {
    ...local,
    rev: Math.max(local.rev ?? 0, server.rev ?? 0),
    serverTs: Math.max(local.serverTs ?? 0, server.serverTs ?? 0),
  };
}

function latestWriteTs(row) {
  let latest = row.deletedAt ?? 0;
  for (const ts of Object.values(row.fieldTs ?? {})) {
    if (ts > latest) latest = ts;
  }
  return latest;
}
