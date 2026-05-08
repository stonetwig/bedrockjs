import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import { denoKvAdapter } from '../adapters/deno-kv.ts';
import { sqliteAdapter } from '../adapters/sqlite.ts';
import type { StorageAdapter } from '../adapters/types.ts';
import type { Row } from '../protocol.ts';

async function exercise(adapter: StorageAdapter, scope: string) {
  await adapter.init(['todo']);
  const row: Row = {
    id: 'a',
    rev: 0,
    serverTs: 100,
    fieldTs: { title: 100 },
    data: { title: 'one' },
  };
  const c1 = await adapter.appendChange(scope, 'todo', row);
  assertEquals(c1, 1);

  const got = await adapter.get(scope, 'todo', 'a');
  assertExists(got);
  assertEquals(got!.data.title, 'one');
  assertEquals(got!.rev, 1);

  const c2 = await adapter.appendChange(scope, 'todo', {
    ...row,
    serverTs: 200,
    fieldTs: { title: 200 },
    data: { title: 'two' },
  });
  assertEquals(c2, 2);
  assertEquals(await adapter.currentCursor(scope, 'todo'), 2);

  const live: Row[] = [];
  for await (const r of adapter.list(scope, 'todo')) live.push(r);
  assertEquals(live.length, 1);
  assertEquals(live[0].data.title, 'two');

  const changes = [];
  for await (const c of adapter.changesSince(scope, 'todo', 1)) changes.push(c);
  assertEquals(changes.length, 1);
  assertEquals(changes[0].cursor, 2);

  // Op dedupe roundtrip.
  await adapter.rememberOp(scope, 'todo', 'op-1', live[0], 2);
  const remembered = await adapter.rememberedOp(scope, 'todo', 'op-1');
  assertExists(remembered);
  assertEquals(remembered!.cursor, 2);

  // Tombstone disappears from list().
  await adapter.appendChange(scope, 'todo', {
    ...row,
    serverTs: 300,
    deletedAt: 300,
    data: {},
    fieldTs: {},
  });
  const after: Row[] = [];
  for await (const r of adapter.list(scope, 'todo')) after.push(r);
  assertEquals(after.length, 0);

  await adapter.close?.();
}

Deno.test('deno-kv adapter: append/list/changes/dedupe', async () => {
  // Use a per-test in-memory KV.
  const kv = await Deno.openKv(':memory:');
  const adapter = denoKvAdapter({ kv });
  await exercise(adapter, 'u1');
  kv.close();
});

Deno.test('sqlite adapter: append/list/changes/dedupe', async () => {
  const adapter = sqliteAdapter({ path: ':memory:' });
  await exercise(adapter, 'u1');
});

Deno.test('adapters: scopes are isolated', async () => {
  const kv = await Deno.openKv(':memory:');
  const a = denoKvAdapter({ kv });
  await a.init(['todo']);
  await a.appendChange('alice', 'todo', {
    id: 'x',
    rev: 0,
    serverTs: 1,
    fieldTs: { t: 1 },
    data: { t: 'a' },
  });
  const bobList = [];
  for await (const r of a.list('bob', 'todo')) bobList.push(r);
  assertEquals(bobList.length, 0);
  await a.close?.();
  kv.close();
});
