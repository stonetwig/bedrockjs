# Changelog

## 0.1.3 - 2026-07-05

### Fixed

- Fixed an IndexedDB schema-upgrade race in synced models where one model could keep using a stale database connection after another model added a new object store.
- Added IndexedDB `versionchange` handling so open sync database connections close before another tab or connection performs an upgrade.
- Reacquire the current IndexedDB connection for sync model reads, writes, server row application, cursor reads, and outbox cleanup; retry once on stale connection errors.
- Catch and retry sync stream setup failures so initial IndexedDB startup problems do not surface as uncaught promises.
