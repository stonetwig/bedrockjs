/**
 * BedrockJS sync — server-side public entry (Deno).
 *
 *   import { createSyncServer, denoKvAdapter } from 'bedrockjs/sync/server';
 */

export { createSyncServer } from './server.ts';
export type { SyncServerOptions } from './server.ts';
export type { StorageAdapter } from './adapters/types.ts';
export { denoKvAdapter } from './adapters/deno-kv.ts';
export type { DenoKvAdapterOptions } from './adapters/deno-kv.ts';
export { sqliteAdapter } from './adapters/sqlite.ts';
export type { SqliteAdapterOptions } from './adapters/sqlite.ts';
export { PROTOCOL_VERSION } from './protocol.ts';
export type {
  Change,
  ChangeEvent,
  Op,
  OpResult,
  OpsRequest,
  OpsResponse,
  Row,
  SnapshotResponse,
} from './protocol.ts';
