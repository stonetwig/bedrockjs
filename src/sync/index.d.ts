/**
 * Type definitions for `bedrockjs/sync` (browser entry).
 */

export type FieldKind = 'string' | 'number' | 'boolean' | 'datetime';

export interface ModelSchema {
  fields: Record<string, FieldKind>;
}

export interface SyncedModel<T = Record<string, unknown>> {
  readonly name: string;
  readonly schema: ModelSchema;
  /** Resolves once the local store has been hydrated from IndexedDB. */
  readonly ready: Promise<void>;
  create(input: T & { id: string }): Promise<T & { id: string; rev: number }>;
  update(
    id: string,
    patch: Partial<T>,
  ): Promise<T & { id: string; rev: number }>;
  delete(id: string): Promise<void>;
  get(id: string): (T & { id: string; rev: number }) | undefined;
  /** Reactive array — safe to use directly in `html`` templates. */
  all(): Array<T & { id: string; rev: number }>;
  where(
    pred: (item: T & { id: string; rev: number }) => boolean,
  ): Array<T & { id: string; rev: number }>;
  subscribe(
    cb: (items: Array<T & { id: string; rev: number }>) => void,
  ): () => void;
}

export interface SyncConfig {
  /** Base URL for the server sync routes. Defaults to same-origin `/sync`. */
  baseUrl?: string;
  /** IndexedDB database name. Defaults to `'bedrockjs-sync'`. */
  dbName?: string;
  /** Custom fetch implementation (testing). */
  fetch?: typeof fetch;
  /** Custom EventSource constructor (testing / polyfill). */
  EventSource?: typeof EventSource;
}

export function configureSync(opts?: SyncConfig): void;

export function syncedModel<T = Record<string, unknown>>(
  name: string,
  schema: ModelSchema,
): SyncedModel<T>;

export function defineSyncedModel<T = Record<string, unknown>>(
  name: string,
  schema: ModelSchema,
  ctx: { client: ReturnType<typeof createSyncClient>; dbName?: string },
): SyncedModel<T>;

export function createSyncClient(opts?: {
  baseUrl?: string;
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
}): {
  registerModel(name: string, hooks: unknown): void;
  start(): void;
  stop(): void;
  drain(): Promise<void>;
  scheduleDrain(delay?: number): void;
  readonly baseUrl: string;
};
