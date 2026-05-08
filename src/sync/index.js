/**
 * BedrockJS sync — browser public entry.
 *
 *   import { syncedModel } from 'bedrockjs/sync';
 *
 *   const Todo = syncedModel('todo', {
 *     fields: {
 *       id: 'string', title: 'string', completed: 'boolean',
 *       rev: 'number', createdAt: 'datetime', updatedAt: 'datetime',
 *     },
 *   });
 *
 *   await Todo.create({ id: crypto.randomUUID(), title: 'Buy milk', completed: false });
 *
 * The default sync client uses same-origin `/sync`. Override with:
 *
 *   configureSync({ baseUrl: 'https://api.example.com/sync' });
 */

import { createSyncClient } from './client.js';
import { defineSyncedModel } from './model.js';

let _client = null;
let _config = { baseUrl: '/sync', dbName: 'bedrockjs-sync' };
let _started = false;

/**
 * Configure the default sync client. Must be called before any model is
 * created if you want to override the same-origin defaults.
 *
 * @param {{ baseUrl?: string, dbName?: string, fetch?: typeof fetch, EventSource?: typeof EventSource }} opts
 */
export function configureSync(opts = {}) {
  if (_client) {
    throw new Error(
      'configureSync(): default client already created. Call before defining models.',
    );
  }
  _config = { ..._config, ...opts };
}

function getClient() {
  if (!_client) {
    _client = createSyncClient({
      baseUrl: _config.baseUrl,
      fetch: _config.fetch,
      EventSource: _config.EventSource,
    });
  }
  if (!_started && typeof window !== 'undefined') {
    _started = true;
    _client.start();
  }
  return _client;
}

/**
 * Define a synced model bound to the default client.
 * @param {string} name
 * @param {{ fields: Record<string, 'string'|'number'|'boolean'|'datetime'> }} schema
 */
export function syncedModel(name, schema) {
  return defineSyncedModel(name, schema, {
    client: getClient(),
    dbName: _config.dbName,
  });
}

export { defineSyncedModel, createSyncClient };
