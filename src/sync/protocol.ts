/**
 * BedrockJS sync — wire protocol & shared types.
 *
 * This module is consumed by both the browser client and the Deno server.
 * It contains only types and pure helpers — no I/O.
 */

export const PROTOCOL_VERSION = 1;

/** Supported field kinds in a synced model schema. */
export type FieldKind = "string" | "number" | "boolean" | "datetime";

/** Schema definition passed to `syncedModel()`. */
export interface ModelSchema {
  fields: Record<string, FieldKind>;
}

/** A row stored on the server, including replication metadata. */
export interface Row {
  id: string;
  /** Server-assigned monotonic revision per row. */
  rev: number;
  /** Server timestamp (ms) when the row was last touched. */
  serverTs: number;
  /** Per-field server timestamps (ms) used for last-writer-wins merges. */
  fieldTs: Record<string, number>;
  /** Tombstone marker; when set, the row is deleted. */
  deletedAt?: number;
  /** Arbitrary user fields declared in the schema. */
  data: Record<string, unknown>;
}

/** A change emitted in the per-(scope,model) change log. */
export interface Change {
  cursor: number;
  model: string;
  id: string;
  row: Row;
}

/** Mutation op sent client → server. */
export type Op =
  | {
      opId: string;
      type: "create";
      model: string;
      id: string;
      data: Record<string, unknown>;
      clientTs: number;
    }
  | {
      opId: string;
      type: "update";
      model: string;
      id: string;
      patch: Record<string, unknown>;
      clientTs: number;
    }
  | {
      opId: string;
      type: "delete";
      model: string;
      id: string;
      clientTs: number;
    };

/** Per-op result returned by POST /sync/:model/ops. */
export interface OpResult {
  opId: string;
  status: "applied" | "duplicate" | "rejected";
  row?: Row;
  cursor?: number;
  error?: string;
}

/** Body of POST /sync/:model/ops. */
export interface OpsRequest {
  protocol: number;
  ops: Op[];
}

/** Body returned by POST /sync/:model/ops. */
export interface OpsResponse {
  protocol: number;
  results: OpResult[];
}

/** SSE event payload (in `data:` field). */
export interface ChangeEvent {
  type: "change";
  model: string;
  id: string;
  row: Row;
  cursor: number;
}

/** Snapshot response shape. */
export interface SnapshotResponse {
  protocol: number;
  model: string;
  cursor: number;
  changes: Change[];
}

/**
 * Generate a short, unique operation id. Uses crypto.randomUUID when
 * available, falling back to a timestamp + random suffix.
 */
export function makeOpId(): string {
  const c =
    (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Current epoch ms. */
export function now(): number {
  return Date.now();
}

/**
 * Coerce a user-supplied value to the field's declared kind for storage.
 * Datetimes are stored as ISO strings.
 */
export function coerceField(kind: FieldKind, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  switch (kind) {
    case "string":
      return typeof value === "string" ? value : String(value);
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "boolean":
      return typeof value === "boolean" ? value : Boolean(value);
    case "datetime":
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "number") return new Date(value).toISOString();
      return String(value);
  }
}

/**
 * Apply a server-stamped op to a row using per-field LWW.
 * Returns the new row, or null if the op was a no-op (older timestamp on every field).
 */
export function applyOp(
  existing: Row | null,
  op: Op,
  serverTs: number,
  nextRev: number,
): Row | null {
  // Delete: tombstone wins if its serverTs >= existing.serverTs.
  if (op.type === "delete") {
    if (existing && existing.deletedAt && existing.deletedAt >= serverTs) {
      return null;
    }
    return {
      id: op.id,
      rev: nextRev,
      serverTs,
      fieldTs: existing?.fieldTs ?? {},
      deletedAt: serverTs,
      data: existing?.data ?? {},
    };
  }

  // Create: if a live row already exists, treat as no-op (idempotent).
  if (op.type === "create") {
    if (existing && !existing.deletedAt) {
      // Idempotent: create on existing row is ignored.
      return null;
    }
    const fieldTs: Record<string, number> = {};
    for (const k of Object.keys(op.data)) fieldTs[k] = serverTs;
    return {
      id: op.id,
      rev: nextRev,
      serverTs,
      fieldTs,
      data: { ...op.data },
    };
  }

  // Update: per-field LWW.
  if (!existing || existing.deletedAt) {
    // Resurrecting a tombstone or updating a non-existent row is rejected upstream;
    // but we still build a row so the caller can decide. Safer: refuse here.
    return null;
  }

  const newFieldTs = { ...existing.fieldTs };
  const newData = { ...existing.data };
  let changed = false;

  for (const [k, v] of Object.entries(op.patch)) {
    const prevTs = newFieldTs[k] ?? 0;
    if (serverTs >= prevTs) {
      newData[k] = v;
      newFieldTs[k] = serverTs;
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    id: existing.id,
    rev: nextRev,
    serverTs,
    fieldTs: newFieldTs,
    data: newData,
  };
}
