/**
 * BedrockJS sync server.
 *
 *   import { createSyncServer } from 'bedrockjs/sync/server';
 *   import { denoKvAdapter } from 'bedrockjs/sync/server';
 *
 *   const handler = await createSyncServer({
 *     storage: denoKvAdapter(),
 *     models: ['todo'],
 *   });
 *   Deno.serve(handler);
 *
 * Routes (all under `basePath`, default `/sync`):
 *   POST /sync/:model/ops                 - apply a batch of mutations
 *   GET  /sync/:model/stream?since=N      - SSE stream of subsequent changes
 *   GET  /sync/:model/snapshot?since=N    - JSON list of changes since cursor
 */

import {
  applyOp,
  type ChangeEvent,
  type Op,
  type OpResult,
  type OpsRequest,
  type OpsResponse,
  PROTOCOL_VERSION,
  type Row,
  type SnapshotResponse,
} from "./protocol.ts";
import type { StorageAdapter } from "./adapters/types.ts";

export interface SyncServerOptions {
  storage: StorageAdapter;
  models: string[];
  /** Hook used to scope all storage; return null/undefined to deny (401). */
  scope?: (req: Request) =>
    | string
    | null
    | undefined
    | Promise<
      string | null | undefined
    >;
  /** URL prefix for all sync routes. Defaults to `/sync`. */
  basePath?: string;
  /** Enable permissive CORS (Access-Control-Allow-Origin: *). */
  cors?: boolean;
}

type Subscriber = (ev: ChangeEvent) => void;

export async function createSyncServer(
  opts: SyncServerOptions,
): Promise<(req: Request) => Promise<Response>> {
  const basePath = (opts.basePath ?? "/sync").replace(/\/$/, "");
  const models = new Set(opts.models);

  await opts.storage.init(opts.models);

  // scope -> model -> Set<Subscriber>
  const subscribers = new Map<string, Map<string, Set<Subscriber>>>();
  const rowLocks = new Map<string, Promise<void>>();

  function bus(scope: string, model: string): Set<Subscriber> {
    let perScope = subscribers.get(scope);
    if (!perScope) subscribers.set(scope, perScope = new Map());
    let perModel = perScope.get(model);
    if (!perModel) perScope.set(model, perModel = new Set());
    return perModel;
  }

  function publish(scope: string, ev: ChangeEvent) {
    const m = subscribers.get(scope)?.get(ev.model);
    if (!m) return;
    for (const sub of m) {
      try {
        sub(ev);
      } catch {
        // ignore individual subscriber failures
      }
    }
  }

  async function withRowLock<T>(
    scope: string,
    model: string,
    id: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `${scope}\0${model}\0${id}`;
    const previous = rowLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    rowLocks.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (rowLocks.get(key) === tail) rowLocks.delete(key);
    }
  }

  function corsHeaders(): HeadersInit {
    return opts.cors
      ? {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      }
      : {};
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  async function resolveScope(req: Request): Promise<string | null> {
    if (!opts.scope) return "";
    const s = await opts.scope(req);
    if (s === null || s === undefined) return null;
    return s;
  }

  async function handleOps(
    req: Request,
    scope: string,
    model: string,
  ): Promise<Response> {
    let body: OpsRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    if (!body || !Array.isArray(body.ops)) {
      return json({ error: "invalid body" }, 400);
    }
    if (body.protocol !== PROTOCOL_VERSION) {
      return json(
        { error: `protocol mismatch (expected ${PROTOCOL_VERSION})` },
        400,
      );
    }

    const results: OpResult[] = [];
    for (const op of body.ops) {
      if (op.model !== model) {
        results.push({
          opId: op.opId,
          status: "rejected",
          error: "model mismatch",
        });
        continue;
      }
      const r = await withRowLock(scope, model, op.id, async () => {
        const remembered = await opts.storage.rememberedOp(
          scope,
          model,
          op.opId,
        );
        if (remembered) {
          return {
            opId: op.opId,
            status: "duplicate",
            row: remembered.row,
            cursor: remembered.cursor,
          } satisfies OpResult;
        }
        const result = await applySingleOp(scope, model, op);
        if (
          result.status === "applied" && result.row && result.cursor != null
        ) {
          await opts.storage.rememberOp(
            scope,
            model,
            op.opId,
            result.row,
            result.cursor,
          );
        }
        return result;
      });
      results.push(r);
      if (r.status === "applied" && r.row && r.cursor != null) {
        publish(scope, {
          type: "change",
          model,
          id: r.row.id,
          row: r.row,
          cursor: r.cursor,
        });
      }
    }

    const resp: OpsResponse = { protocol: PROTOCOL_VERSION, results };
    return json(resp);
  }

  async function applySingleOp(
    scope: string,
    model: string,
    op: Op,
  ): Promise<OpResult> {
    const existing = await opts.storage.get(scope, model, op.id);
    const serverTs = Date.now();
    // We pass `0` as nextRev — the storage layer will assign the real one.
    const merged = applyOp(existing, op, serverTs, 0);
    if (!merged) {
      // Idempotent no-op: if existing row is present, return it as duplicate;
      // otherwise reject (e.g. update on missing record).
      if (existing) {
        return {
          opId: op.opId,
          status: "duplicate",
          row: existing,
          cursor: await opts.storage.currentCursor(scope, model),
        };
      }
      return { opId: op.opId, status: "rejected", error: "no-op" };
    }
    const cursor = await opts.storage.appendChange(scope, model, merged);
    const finalRow: Row = { ...merged, rev: cursor };
    return { opId: op.opId, status: "applied", row: finalRow, cursor };
  }

  async function handleSnapshot(
    _req: Request,
    scope: string,
    model: string,
    since: number,
  ): Promise<Response> {
    const changes = [];
    for await (const c of opts.storage.changesSince(scope, model, since)) {
      changes.push(c);
    }
    const cursor = await opts.storage.currentCursor(scope, model);
    const resp: SnapshotResponse = {
      protocol: PROTOCOL_VERSION,
      model,
      cursor,
      changes,
    };
    return json(resp);
  }

  function handleStream(
    req: Request,
    scope: string,
    model: string,
    since: number,
  ): Response {
    const encoder = new TextEncoder();
    let sub: Subscriber;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function send(ev: ChangeEvent) {
          if (closed) return;
          const block = `event: change\n` +
            `id: ${ev.cursor}\n` +
            `data: ${JSON.stringify(ev)}\n\n`;
          try {
            controller.enqueue(encoder.encode(block));
          } catch {
            closed = true;
          }
        }

        // Catch-up: emit anything since `since` first.
        try {
          for await (
            const c of opts.storage.changesSince(scope, model, since)
          ) {
            send({
              type: "change",
              model,
              id: c.id,
              row: c.row,
              cursor: c.cursor,
            });
          }
        } catch {
          // ignore; client will retry/snapshot
        }

        sub = (ev) => send(ev);
        bus(scope, model).add(sub);

        // Heartbeat to keep connection alive through proxies.
        const hb = setInterval(() => {
          if (closed) {
            clearInterval(hb);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            closed = true;
            clearInterval(hb);
          }
        }, 25_000);

        const onAbort = () => {
          closed = true;
          clearInterval(hb);
          bus(scope, model).delete(sub);
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        };
        req.signal.addEventListener("abort", onAbort);
      },
      cancel() {
        closed = true;
        if (sub) bus(scope, model).delete(sub);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...corsHeaders(),
      },
    });
  }

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(basePath + "/")) {
      return new Response("not found", { status: 404, headers: corsHeaders() });
    }

    if (req.method === "OPTIONS" && opts.cors) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const tail = url.pathname.slice(basePath.length + 1).split("/");
    if (tail.length !== 2) {
      return json({ error: "unknown route" }, 404);
    }
    const [modelEnc, action] = tail;
    const model = decodeURIComponent(modelEnc);
    if (!models.has(model)) {
      return json({ error: `unknown model ${model}` }, 404);
    }

    const scope = await resolveScope(req);
    if (scope === null) {
      return json({ error: "unauthorized" }, 401);
    }

    if (action === "ops" && req.method === "POST") {
      return handleOps(req, scope, model);
    }
    if (action === "snapshot" && req.method === "GET") {
      const since = Number(url.searchParams.get("since") ?? "0") || 0;
      return handleSnapshot(req, scope, model, since);
    }
    if (action === "stream" && req.method === "GET") {
      const since = Number(url.searchParams.get("since") ?? "0") || 0;
      return handleStream(req, scope, model, since);
    }
    return json({ error: "unknown route" }, 404);
  };
}
