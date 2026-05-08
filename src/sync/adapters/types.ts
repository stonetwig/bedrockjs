/**
 * Storage adapter interface used by `createSyncServer`.
 *
 * Two adapters ship with BedrockJS:
 *   - `denoKvAdapter()`   — built on Deno.openKv()
 *   - `sqliteAdapter()`   — built on jsr:@db/sqlite
 *
 * Consumers can implement this interface to plug in any database.
 *
 * Conventions:
 *   - All keys are namespaced by (scope, model). `scope` is `''` when the
 *     server has no scope hook configured.
 *   - `appendChange` MUST atomically: write the new row, append to the change
 *     log, and bump the per-(scope,model) cursor.
 *   - `cursor` is a positive integer that monotonically increases per
 *     (scope, model). Clients pass `since=<cursor>` to receive everything
 *     strictly greater than that value.
 */

import type { Row, Change } from '../protocol.ts';

export interface StorageAdapter {
  /** Called once at server start with the list of registered models. */
  init(models: string[]): Promise<void>;

  /** Look up a row (including tombstones) by id. */
  get(scope: string, model: string, id: string): Promise<Row | null>;

  /**
   * Atomically write a row, append it to the change log, and advance the
   * cursor. Returns the new cursor value assigned to this change.
   */
  appendChange(scope: string, model: string, row: Row): Promise<number>;

  /** Iterate all live (non-tombstone) rows for a model in `scope`. */
  list(scope: string, model: string): AsyncIterable<Row>;

  /** Iterate changes with cursor strictly greater than `since`. */
  changesSince(
    scope: string,
    model: string,
    since: number,
  ): AsyncIterable<Change>;

  /** Current cursor for (scope, model). */
  currentCursor(scope: string, model: string): Promise<number>;

  /**
   * Op id dedupe: returns the previously-recorded result row for `opId` if
   * the server has already applied it, otherwise null.
   */
  rememberedOp(
    scope: string,
    model: string,
    opId: string,
  ): Promise<{ row: Row; cursor: number } | null>;

  /** Record that `opId` produced `row` at `cursor`. */
  rememberOp(
    scope: string,
    model: string,
    opId: string,
    row: Row,
    cursor: number,
  ): Promise<void>;

  /** Optional cleanup. */
  close?(): Promise<void> | void;
}
