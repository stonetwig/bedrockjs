/**
 * BedrockJS sync client — transports ops to the server over HTTP POST,
 * subscribes to server changes via SSE, and orchestrates the per-model
 * outbox drain.
 *
 * Usage:
 *   const client = createSyncClient({ baseUrl: '/sync' });
 *   client.registerModel('todo', {
 *     onServerRow: (row, cursor) => { ... },
 *     getCursor: () => Promise<number>,
 *     getOutbox: () => Promise<Array<{seq, op}>>,
 *     ackOutbox: (seqs) => Promise<void>,
 *   });
 *   client.start();
 */

import { PROTOCOL_VERSION } from './protocol-version.js';

const DEFAULT_BASE = '/sync';

/**
 * @typedef {Object} ModelHooks
 * @property {(row: any, cursor: number) => void | Promise<void>} onServerRow
 * @property {() => number | Promise<number>} getCursor
 * @property {() => Array<{seq:number, op:any}> | Promise<Array<{seq:number, op:any}>>} getOutbox
 * @property {(seqs: number[]) => void | Promise<void>} ackOutbox
 * @property {(opId: string, error: string) => void} [onRejected]
 */

/**
 * @param {{ baseUrl?: string, fetch?: typeof fetch, EventSource?: typeof EventSource }} [opts]
 */
export function createSyncClient(opts = {}) {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const fetchFn = opts.fetch || globalThis.fetch.bind(globalThis);
  const ESCtor = opts.EventSource ||
    (typeof EventSource !== 'undefined' ? EventSource : null);

  /** @type {Map<string, ModelHooks>} */
  const models = new Map();
  /** @type {Map<string, EventSource>} */
  const streams = new Map();
  let started = false;
  let drainScheduled = false;
  let drainBackoffMs = 500;

  function registerModel(name, hooks) {
    models.set(name, hooks);
    if (started) scheduleStreamConnect(name, 0);
  }

  async function connectStream(name) {
    if (!ESCtor) return; // SSR / no SSE — server-pull will still work via drain
    if (!started || streams.has(name)) return;
    const hooks = models.get(name);
    if (!hooks) return;
    const cursor = await hooks.getCursor();
    if (!started || !models.has(name) || streams.has(name)) return;
    const url = `${baseUrl}/${encodeURIComponent(name)}/stream?since=${cursor}`;
    const es = new ESCtor(url);
    streams.set(name, es);
    es.addEventListener('change', async (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        await hooks.onServerRow(payload.row, payload.cursor);
      } catch (err) {
        // Malformed event — swallow, the next snapshot will reconcile.
        console.warn('[bedrockjs/sync] bad SSE payload', err);
      }
    });
    es.onerror = () => {
      // Browser auto-reconnects; nothing to do.
    };
  }

  function scheduleStreamConnect(name, delay) {
    setTimeout(() => {
      connectStream(name).catch((err) => {
        console.warn(`[bedrockjs/sync] stream setup failed for "${name}"`, err);
        if (started && models.has(name) && !streams.has(name)) {
          scheduleStreamConnect(name, drainBackoffMs);
        }
      });
    }, delay);
  }

  function start() {
    if (started) return;
    started = true;
    for (const name of models.keys()) scheduleStreamConnect(name, 0);
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('online', () => scheduleDrain(0));
    }
    scheduleDrain(0);
  }

  function stop() {
    started = false;
    for (const es of streams.values()) es.close();
    streams.clear();
  }

  function scheduleDrain(delay = drainBackoffMs) {
    if (drainScheduled) return;
    drainScheduled = true;
    setTimeout(() => {
      drainScheduled = false;
      drain().catch(() => {
        // Backoff on failure
        drainBackoffMs = Math.min(drainBackoffMs * 2, 30_000);
        scheduleDrain();
      });
    }, delay);
  }

  async function drain() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    let didWork = false;
    for (const [name, hooks] of models.entries()) {
      const entries = await hooks.getOutbox();
      if (!entries || entries.length === 0) continue;
      // Group by model — entries here are from this model's hook only
      // since each model owns its outbox snapshot.
      const ops = entries.map((e) => e.op);
      const res = await fetchFn(
        `${baseUrl}/${encodeURIComponent(name)}/ops`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ protocol: PROTOCOL_VERSION, ops }),
        },
      );
      if (!res.ok) throw new Error(`sync POST failed: ${res.status}`);
      const body = await res.json();
      const ackSeqs = [];
      for (let i = 0; i < entries.length; i++) {
        const r = body.results[i];
        if (!r) continue;
        if (r.status === 'applied' || r.status === 'duplicate') {
          ackSeqs.push(entries[i].seq);
          if (r.row && r.cursor != null) {
            await hooks.onServerRow(r.row, r.cursor);
          }
        } else if (r.status === 'rejected') {
          // Rejected ops are dropped; surface to caller.
          ackSeqs.push(entries[i].seq);
          hooks.onRejected?.(r.opId, r.error || 'rejected');
        }
      }
      if (ackSeqs.length) await hooks.ackOutbox(ackSeqs);
      didWork = true;
    }
    if (didWork) {
      drainBackoffMs = 500; // reset backoff on success
    }
  }

  return {
    registerModel,
    start,
    stop,
    drain,
    scheduleDrain,
    get baseUrl() {
      return baseUrl;
    },
  };
}
