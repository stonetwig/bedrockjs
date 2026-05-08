/**
 * Minimal IndexedDB wrapper for the BedrockJS sync layer.
 *
 * Per database (one per app) we maintain:
 *   - One object store per model (key = id), holding the latest local Row.
 *   - `__outbox__` (auto-increment) holding ordered, unsent ops.
 *   - `__cursor__` (key = model name) holding the highest server cursor seen.
 */

const OUTBOX = '__outbox__';
const CURSOR = '__cursor__';

/** @type {Map<string, Promise<IDBDatabase>>} */
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
  const cached = dbCache.get(dbName);
  if (cached) {
    return cached.then((db) => ensureStores(db, dbName, models));
  }
  const p = openInternal(dbName, models, undefined);
  dbCache.set(dbName, p);
  return p;
}

function openInternal(dbName, models, version) {
  return new Promise((resolve, reject) => {
    const req =
      version === undefined
        ? indexedDB.open(dbName)
        : indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: 'seq', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CURSOR)) {
        db.createObjectStore(CURSOR);
      }
      for (const m of models) {
        if (!db.objectStoreNames.contains(m)) {
          db.createObjectStore(m, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}

async function ensureStores(db, dbName, models) {
  const missing = models.filter((m) => !db.objectStoreNames.contains(m));
  if (missing.length === 0) return db;
  const newVersion = db.version + 1;
  db.close();
  const p = openInternal(dbName, models, newVersion);
  dbCache.set(dbName, p);
  return p;
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
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
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
  const tx = db.transaction([model, OUTBOX], 'readwrite');
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
 */
export async function applyServerRow(db, model, row, cursor) {
  const tx = db.transaction([model, CURSOR], 'readwrite');
  if (row.deletedAt) {
    tx.objectStore(model).delete(row.id);
  } else {
    tx.objectStore(model).put(row);
  }
  tx.objectStore(CURSOR).put(cursor, model);
  await txDone(tx);
}

export async function getCursor(db, model) {
  const tx = db.transaction(CURSOR, 'readonly');
  const v = await reqP(tx.objectStore(CURSOR).get(model));
  return typeof v === 'number' ? v : 0;
}

export async function getAll(db, model) {
  const tx = db.transaction(model, 'readonly');
  return /** @type {any[]} */ (await reqP(tx.objectStore(model).getAll()));
}

export async function getOne(db, model, id) {
  const tx = db.transaction(model, 'readonly');
  return await reqP(tx.objectStore(model).get(id));
}

/** @returns {Promise<Array<{seq:number, op:Object}>>} */
export async function readOutbox(db) {
  const tx = db.transaction(OUTBOX, 'readonly');
  return /** @type {any} */ (await reqP(tx.objectStore(OUTBOX).getAll()));
}

export async function deleteOutboxEntries(db, seqs) {
  const tx = db.transaction(OUTBOX, 'readwrite');
  const store = tx.objectStore(OUTBOX);
  for (const s of seqs) store.delete(s);
  await txDone(tx);
}
