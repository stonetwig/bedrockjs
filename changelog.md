# Changelog

## 0.1.4 - 2026-07-05

### Fixed

- Fixed synced model race conditions where older HTTP operations arriving later could overwrite newer local writes.
- Use monotonic client write timestamps for per-field Last-Writer-Wins conflict ordering instead of server receive time.
- Prevent stale SSE stream events and server acknowledgements from replacing newer pending local field values, avoiding counter values jumping backward during rapid clicks.
- Serialize server-side operation application per scoped model row so concurrent requests merge against the latest committed row.
- Serialize client outbox drains so one browser tab does not send overlapping sync POST batches.
- Preserve per-field local write timestamps only for patched fields, and keep local tombstones in IndexedDB so stale server rows cannot resurrect deleted records.

### Tests

- Added regressions for delayed stale server operations, stale client-side server row merges, and stale tombstone handling.

## 0.1.3 - 2026-07-05

### Fixed

- Fixed an IndexedDB schema-upgrade race in synced models where one model could keep using a stale database connection after another model added a new object store.
- Added IndexedDB `versionchange` handling so open sync database connections close before another tab or connection performs an upgrade.
- Reacquire the current IndexedDB connection for sync model reads, writes, server row application, cursor reads, and outbox cleanup; retry once on stale connection errors.
- Catch and retry sync stream setup failures so initial IndexedDB startup problems do not surface as uncaught promises.
