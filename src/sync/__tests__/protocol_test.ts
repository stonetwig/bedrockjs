import { assertEquals } from 'jsr:@std/assert@1';
import { applyOp, type Op, type Row } from '../protocol.ts';

Deno.test('protocol: create then update with LWW', () => {
  const create: Op = {
    opId: '1',
    type: 'create',
    model: 't',
    id: 'a',
    data: { title: 'first', done: false },
    clientTs: 0,
  };
  const r1 = applyOp(null, create, 100, 1)!;
  assertEquals(r1.data.title, 'first');
  assertEquals(r1.fieldTs.title, 100);

  // Older update is dropped on the field it touches.
  const stale: Op = {
    opId: '2',
    type: 'update',
    model: 't',
    id: 'a',
    patch: { title: 'older' },
    clientTs: 0,
  };
  const r2 = applyOp(r1, stale, 50, 2);
  assertEquals(r2, null, 'older serverTs should be a no-op');

  // Newer update wins.
  const fresh: Op = { ...stale, opId: '3', patch: { title: 'newer' } };
  const r3 = applyOp(r1, fresh, 200, 3)!;
  assertEquals(r3.data.title, 'newer');
  assertEquals(r3.fieldTs.title, 200);
  assertEquals(r3.data.done, false, 'untouched field preserved');
});

Deno.test('protocol: delete tombstones, late updates dropped', () => {
  const initial: Row = {
    id: 'a',
    rev: 1,
    serverTs: 100,
    fieldTs: { title: 100 },
    data: { title: 'x' },
  };
  const del: Op = {
    opId: 'd',
    type: 'delete',
    model: 't',
    id: 'a',
    clientTs: 0,
  };
  const t = applyOp(initial, del, 200, 2)!;
  assertEquals(t.deletedAt, 200);

  // Update on a tombstone is rejected.
  const upd: Op = {
    opId: 'u',
    type: 'update',
    model: 't',
    id: 'a',
    patch: { title: 'zombie' },
    clientTs: 0,
  };
  const r = applyOp(t, upd, 300, 3);
  assertEquals(r, null);
});

Deno.test('protocol: create on existing live row is idempotent no-op', () => {
  const initial: Row = {
    id: 'a',
    rev: 1,
    serverTs: 100,
    fieldTs: { title: 100 },
    data: { title: 'x' },
  };
  const c: Op = {
    opId: 'c',
    type: 'create',
    model: 't',
    id: 'a',
    data: { title: 'y' },
    clientTs: 0,
  };
  assertEquals(applyOp(initial, c, 200, 2), null);
});
