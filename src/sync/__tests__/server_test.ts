import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { createSyncServer } from "../server.ts";
import { denoKvAdapter } from "../adapters/deno-kv.ts";
import {
  type ChangeEvent,
  makeOpId,
  type Op,
  type OpsRequest,
  type OpsResponse,
  PROTOCOL_VERSION,
  type SnapshotResponse,
} from "../protocol.ts";

async function newHandler() {
  const kv = await Deno.openKv(":memory:");
  const handler = await createSyncServer({
    storage: denoKvAdapter({ kv }),
    models: ["todo"],
    cors: true,
  });
  return { handler, close: () => kv.close() };
}

function postOps(handler: (r: Request) => Promise<Response>, ops: Op[]) {
  const body: OpsRequest = { protocol: PROTOCOL_VERSION, ops };
  return handler(
    new Request("http://x/sync/todo/ops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

Deno.test("server: applies a create op and returns row + cursor", async () => {
  const { handler, close } = await newHandler();
  const op: Op = {
    opId: makeOpId(),
    type: "create",
    model: "todo",
    id: "a",
    data: { title: "hi", done: false },
    clientTs: 0,
  };
  const res = await postOps(handler, [op]);
  assertEquals(res.status, 200);
  const body: OpsResponse = await res.json();
  assertEquals(body.results[0].status, "applied");
  assertExists(body.results[0].row);
  assertEquals(body.results[0].cursor, 1);
  close();
});

Deno.test("server: opId dedupe returns duplicate without re-applying", async () => {
  const { handler, close } = await newHandler();
  const op: Op = {
    opId: "fixed-op",
    type: "create",
    model: "todo",
    id: "a",
    data: { title: "hi" },
    clientTs: 0,
  };
  const r1: OpsResponse = await (await postOps(handler, [op])).json();
  assertEquals(r1.results[0].status, "applied");
  const r2: OpsResponse = await (await postOps(handler, [op])).json();
  assertEquals(r2.results[0].status, "duplicate");
  close();
});

Deno.test("server: snapshot returns changes since cursor", async () => {
  const { handler, close } = await newHandler();
  await postOps(handler, [
    {
      opId: "1",
      type: "create",
      model: "todo",
      id: "a",
      data: { title: "a" },
      clientTs: 0,
    },
    {
      opId: "2",
      type: "create",
      model: "todo",
      id: "b",
      data: { title: "b" },
      clientTs: 0,
    },
  ]);
  const snap: SnapshotResponse = await (await handler(
    new Request("http://x/sync/todo/snapshot?since=0"),
  )).json();
  assertEquals(snap.changes.length, 2);
  assertEquals(snap.cursor, 2);

  const after: SnapshotResponse = await (await handler(
    new Request("http://x/sync/todo/snapshot?since=1"),
  )).json();
  assertEquals(after.changes.length, 1);
  assertEquals(after.changes[0].cursor, 2);
  close();
});

Deno.test("server: late older update does not overwrite newer value", async () => {
  const { handler, close } = await newHandler();
  await postOps(handler, [
    {
      opId: "create-lww",
      type: "create",
      model: "todo",
      id: "a",
      data: { title: "initial" },
      clientTs: 100,
    },
  ]);

  const newer: OpsResponse = await (await postOps(handler, [
    {
      opId: "newer-update",
      type: "update",
      model: "todo",
      id: "a",
      patch: { title: "newer" },
      clientTs: 300,
    },
  ])).json();
  assertEquals(newer.results[0].status, "applied");

  const stale: OpsResponse = await (await postOps(handler, [
    {
      opId: "stale-update",
      type: "update",
      model: "todo",
      id: "a",
      patch: { title: "stale" },
      clientTs: 200,
    },
  ])).json();
  assertEquals(stale.results[0].status, "duplicate");
  assertEquals(stale.results[0].row?.data.title, "newer");

  const snap: SnapshotResponse = await (await handler(
    new Request("http://x/sync/todo/snapshot?since=0"),
  )).json();
  assertEquals(snap.changes.at(-1)?.row.data.title, "newer");
  close();
});

Deno.test("server: rejects unknown model with 404", async () => {
  const { handler, close } = await newHandler();
  const res = await handler(
    new Request("http://x/sync/nope/snapshot?since=0"),
  );
  assertEquals(res.status, 404);
  await res.body?.cancel();
  close();
});

Deno.test("server: scope hook returning null yields 401", async () => {
  const kv = await Deno.openKv(":memory:");
  const handler = await createSyncServer({
    storage: denoKvAdapter({ kv }),
    models: ["todo"],
    scope: () => null,
  });
  const res = await handler(
    new Request("http://x/sync/todo/snapshot?since=0"),
  );
  assertEquals(res.status, 401);
  await res.body?.cancel();
  kv.close();
});

Deno.test("server: SSE stream broadcasts subsequent changes", async () => {
  const { handler, close } = await newHandler();
  // Open the stream.
  const ctl = new AbortController();
  const streamRes = await handler(
    new Request("http://x/sync/todo/stream?since=0", { signal: ctl.signal }),
  );
  assertEquals(streamRes.headers.get("content-type"), "text/event-stream");
  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();

  // Apply a mutation; the stream should emit it.
  const opPromise = postOps(handler, [
    {
      opId: "sse-1",
      type: "create",
      model: "todo",
      id: "a",
      data: { title: "broadcast" },
      clientTs: 0,
    },
  ]);

  // Read until we see a change event.
  let buf = "";
  let event: ChangeEvent | null = null;
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const m = buf.match(/event: change\nid: \d+\ndata: ({.*})\n\n/);
    if (m) {
      event = JSON.parse(m[1]);
      break;
    }
  }
  await opPromise;
  assertExists(event);
  assertEquals(event!.row.data.title, "broadcast");

  ctl.abort();
  try {
    await reader.cancel();
  } catch { /* ignore */ }
  close();
});
