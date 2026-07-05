import { assertEquals } from "jsr:@std/assert@1";
import { mergeServerRow } from "../indexeddb.js";

Deno.test("client merge: stale server value does not replace newer local value", () => {
  const local = {
    id: "main",
    rev: 1,
    serverTs: 300,
    fieldTs: { value: 300, label: 100 },
    data: { value: 3, label: "Counter" },
  };
  const staleServer = {
    id: "main",
    rev: 2,
    serverTs: 2_000,
    fieldTs: { value: 200, label: 100 },
    data: { value: 2, label: "Counter" },
  };

  const merged = mergeServerRow(local, staleServer);

  assertEquals(merged.data.value, 3);
  assertEquals(merged.fieldTs.value, 300);
  assertEquals(merged.rev, 2);
});

Deno.test("client merge: newer server fields still apply beside local edits", () => {
  const local = {
    id: "main",
    rev: 1,
    serverTs: 300,
    fieldTs: { value: 300, label: 100 },
    data: { value: 3, label: "Counter" },
  };
  const server = {
    id: "main",
    rev: 2,
    serverTs: 2_000,
    fieldTs: { value: 200, label: 400 },
    data: { value: 2, label: "Renamed" },
  };

  const merged = mergeServerRow(local, server);

  assertEquals(merged.data.value, 3);
  assertEquals(merged.data.label, "Renamed");
  assertEquals(merged.fieldTs.value, 300);
  assertEquals(merged.fieldTs.label, 400);
});

Deno.test("client merge: newer local tombstone is not resurrected by stale row", () => {
  const local = {
    id: "main",
    rev: 1,
    serverTs: 300,
    fieldTs: { value: 100 },
    deletedAt: 300,
    data: { value: 1 },
  };
  const staleServer = {
    id: "main",
    rev: 2,
    serverTs: 2_000,
    fieldTs: { value: 200 },
    data: { value: 2 },
  };

  const merged = mergeServerRow(local, staleServer);

  assertEquals(merged.deletedAt, 300);
  assertEquals(merged.data.value, 1);
  assertEquals(merged.rev, 2);
});
