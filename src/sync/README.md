# BedrockJS Sync — Offline-First Real-Time Data Synchronization

A lightweight, pluggable data synchronization layer for BedrockJS components. **Sync offline-first to IndexedDB, auto-upload on reconnect, and stream real-time updates via SSE.**

## Overview

- **Offline-first**: All data reads and writes go through IndexedDB; changes queue locally and sync when online
- **Real-time**: Server-Sent Events (SSE) stream changes to all connected clients in real time
- **Conflict resolution**: Per-field Last-Writer-Wins (LWW) with server-side timestamps, soft deletes via tombstones
- **Pluggable storage**: Default Deno KV adapter (atomic, built-in) or bring your own (SQLite, etc.)
- **Multi-tenant ready**: Optional `scope(req)` hook isolates data per user/tenant
- **Reactive integration**: Works seamlessly with BedrockJS `reactive()` for automatic template updates

## Browser Quick Start

### 1. Define a Model

```javascript
import { html, Component } from 'bedrockjs';
import { syncedModel } from 'bedrockjs/sync';

const Todo = syncedModel('todo', {
  title: String,
  done: Boolean,
});

class TodoApp extends Component {
  static tag = 'todo-app';

  render() {
    const todos = Todo.all();
    return html`
      <ul>
        ${todos.map(todo => html`
          <li>
            <input type="checkbox" .checked=${todo.done}
              on-change=${(e) => todo.done = e.target.checked}>
            ${todo.title}
            <button on-click=${() => Todo.delete(todo.id)}>×</button>
          </li>
        `)}
      </ul>
      <input type="text" id="new-title">
      <button on-click=${() => {
        const input = document.querySelector('#new-title');
        Todo.create({ title: input.value, done: false });
        input.value = '';
      }}>Add</button>
    `;
  }
}

TodoApp.register();
```

### 2. Configure Sync

```javascript
import { configureSync } from 'bedrockjs/sync';

// Configure once at app startup
configureSync({
  baseUrl: 'http://localhost:3000',  // or leave default for same-origin
  dbName: 'my-app-db',                // default: 'bedrockjs-sync'
});
```

### 3. API Reference

#### `syncedModel(modelName, schema, options?)`

Returns a typed collection factory.

```javascript
const User = syncedModel('user', {
  name: String,
  email: String,
  age: Number,
});

// Create
await User.create({ name: 'Alice', email: 'alice@example.com', age: 30 });

// Read
const user = await User.get('user-id-123');
const allUsers = await User.all();  // Returns reactive array, safe for templates
const users30 = await User.where(u => u.age === 30);

// Update
user.age = 31;  // Mutations fire sync automatically
await User.update(user);

// Delete
await User.delete('user-id-123');

// Subscribe to changes
const unsub = User.subscribe((change) => {
  console.log(`${change.type}: ${change.id}`, change.data);
});
unsub();
```

#### `configureSync(options)`

```javascript
{
  baseUrl: 'http://localhost:3000',  // Sync server URL (default: same origin)
  dbName: 'bedrockjs-sync',          // IndexedDB database name
  retryBackoffMs: 5000,              // Initial backoff (default: 5000)
  maxRetryMs: 60000,                 // Max backoff (default: 60000)
}
```

## Server Quick Start (Deno)

### 1. Create Handler

```typescript
import { createSyncServer } from 'bedrockjs/sync/server';
import { denoKvAdapter } from 'bedrockjs/sync/server';

const syncServer = createSyncServer({
  adapter: denoKvAdapter(),  // Uses Deno KV (default)
  // Optional: multi-tenant isolation
  scope: (req) => {
    const user = req.headers.get('x-user-id');
    return user || null;  // null → 401 Unauthorized
  },
});
```

### 2. Register Routes

```typescript
import { serve } from 'std/http/server.ts';

const handler = (req: Request): Promise<Response> => {
  // Route Sync requests
  if (req.url.startsWith('/sync/')) {
    return syncServer(req);
  }
  return new Response('Not found', { status: 404 });
};

serve(handler, { port: 3000 });
```

### 3. Test with cURL

```bash
# Create a todo
curl -X POST http://localhost:3000/sync/todo/ops \
  -H 'Content-Type: application/json' \
  -d '{
    "protocol": 1,
    "ops": [{
      "opId": "client-123-1",
      "type": "create",
      "model": "todo",
      "id": "todo-1",
      "data": { "title": "Buy milk", "done": false },
      "clientTs": 1234567890000
    }]
  }'

# Get snapshot
curl http://localhost:3000/sync/todo/snapshot?since=0

# Stream updates
curl http://localhost:3000/sync/todo/stream?since=0
```

## Server Routes

### `POST /sync/:model/ops`

Submit a batch of operations (create, update, delete). Server applies, stores, and broadcasts to all SSE subscribers.

**Request:**
```json
{
  "protocol": 1,
  "ops": [
    {
      "opId": "unique-op-id",
      "type": "create|update|delete",
      "model": "todo",
      "id": "todo-id",
      "data": { "field": "value" },
      "clientTs": 1234567890000
    }
  ]
}
```

**Response:**
```json
{
  "protocol": 1,
  "results": [
    {
      "opId": "unique-op-id",
      "id": "todo-id",
      "rev": 2,
      "serverTs": 1234567891000
    }
  ]
}
```

### `GET /sync/:model/snapshot?since=N`

Fetch all rows since sequence number N (for initial sync or recovery).

**Response:**
```json
{
  "protocol": 1,
  "rows": [
    {
      "id": "todo-1",
      "rev": 2,
      "serverTs": 1234567891000,
      "fieldTs": { "title": 1234567891000, "done": 1234567892000 },
      "data": { "title": "Buy milk", "done": false }
    }
  ],
  "cursor": 42
}
```

### `GET /sync/:model/stream?since=N`

Subscribe to a stream of changes via Server-Sent Events. Connection stays open, sending heartbeat every 25 seconds.

**Event stream:**
```
data: {"op":{"type":"create","id":"todo-1","rev":1,"data":{...},"serverTs":1234567891000},"cursor":41}
data: {"op":{"type":"update","id":"todo-1","rev":2,"fieldTs":{"title":1234567892000},...},"cursor":42}
```

## Multi-Tenant Example

```typescript
import { createSyncServer } from 'bedrockjs/sync/server';
import { sqliteAdapter } from 'bedrockjs/sync/adapters/sqlite';

const syncServer = createSyncServer({
  adapter: sqliteAdapter('./my-app.db'),
  scope: (req) => {
    const auth = req.headers.get('authorization');
    if (!auth) return null;
    const user = verifyToken(auth);
    return user?.id || null;
  },
});
```

Each scope is completely isolated: `user-1` can never see `user-2`'s data, even with concurrent requests.

## Conflict Resolution

BedrockJS Sync uses **Last-Writer-Wins** per field:

- Each field value carries its server-side write timestamp (`fieldTs[field]`)
- When ops arrive out of order, the one with the **newer timestamp wins**
- Tiebreaker: opId for deterministic resolution
- Deletions are soft: tombstone row with `deleted: true` survives until GC

Example:

```
Client A: update title to "A" at clientTs=1000 (serverTs=2000)
Client B: update title to "B" at clientTs=1050 (serverTs=2100)  ← wins (newer serverTs)
```

## Storage Adapters

### Deno KV (Default)

Built-in, atomic, no setup required.

```typescript
import { createSyncServer, denoKvAdapter } from 'bedrockjs/sync/server';

const server = createSyncServer({
  adapter: denoKvAdapter(),
});
```

**Pros:**
- Atomic multi-key transactions
- Built-in TTL expiration for ops
- No external dependencies
- Suitable for small-to-medium apps

### SQLite

Portable file-based storage, suitable for offline-first server patterns.

```typescript
import { createSyncServer, sqliteAdapter } from 'bedrockjs/sync/server';

const server = createSyncServer({
  adapter: sqliteAdapter('./data.db'),
});
```

**Setup:**
```bash
deno add jsr:@db/sqlite
```

**Pros:**
- Portable, single file per database
- Standard SQL tools compatible
- Good for development and small deployments
- Supports full 64-bit integers for timestamps

### Custom Adapter

Implement the `StorageAdapter` interface to bring your own database:

```typescript
interface StorageAdapter {
  append(scope, model, op): Promise<Row>;
  get(scope, model, id): Promise<Row | null>;
  list(scope, model): Promise<Row[]>;
  listChanges(scope, model, since): Promise<{ rows: Row[], cursor: number }>;
  getCursor(scope, model): Promise<number>;
  rememberCursor(scope, model, cursor): Promise<void>;
  dedupeOp(scope, model, opId): Promise<boolean>;
}
```

## Example: Todo App

See [`examples/sync/`](../examples/sync/) for a complete working example:
- `server.ts` - Deno server with Sync handler
- `index.html` - HTML page with sync component
- `app.js` - Todo component using `syncedModel`

Start the server:

```bash
deno task sync:dev
```

Open `http://localhost:8765/examples/sync/` in two browser windows side-by-side. Open DevTools and test offline behavior: toggle the network in DevTools, add/edit todos offline, go online, and watch them sync and appear in both windows.

## API Glossary

| Term | Meaning |
|------|---------|
| **opId** | Unique client-generated operation ID for deduplication |
| **rev** | Server-assigned revision counter per row |
| **serverTs** | Server-side receive timestamp (ms) |
| **fieldTs** | Map of `{ field: timestamp }` for per-field LWW |
| **cursor** | Server-side sequence number for consistent snapshots |
| **scope** | Tenant/user isolation key (default: null / global) |
| **SSE** | Server-Sent Events (unidirectional server→client stream) |
| **LWW** | Last-Writer-Wins conflict strategy |

## Testing

Run all sync tests:

```bash
deno task test
```

Tests cover:
- Protocol LWW merge logic
- IndexedDB wrapper (append, list, clear)
- Both storage adapters (Deno KV, SQLite)
- Server routes (POST /ops, GET /snapshot, GET /stream)
- SSE streaming and deduplication
- Multi-tenant scope isolation

## Limitations & Roadmap

- **No deletion GC yet**: Tombstones accumulate; future version will add periodic cleanup
- **No schema validation**: Server does not validate field types; clients should validate
- **No encryption at rest**: Consider TLS in transit and application-level encryption if needed
- **Browser storage only**: Mobile apps should use platform-specific SQLite bindings
- **Linear event log**: No sharding; suitable for small-to-medium apps per scope

See the main [README](../README.md) for more on BedrockJS framework features.
