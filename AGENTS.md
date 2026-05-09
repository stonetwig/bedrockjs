# BedrockJS — Agent Guidance

This file provides concise guidance and prompt templates for language models (agents) that generate or modify BedrockJS code. It is based on the BedrockJS LLM reference (`LLMS.md`) and focuses on actionable instructions, import patterns, component templates, and common tasks.

## Goals for an agent

- Understand the BedrockJS primitives: `html`, `render`, `Component`, `reactive`, `watch`, `computed`, `signal`, `batch`, and routing helpers.
- Produce idiomatic components that use `static tag`, `static properties`, and `render()`.
- Prefer `keyed()` for list rendering when items have stable ids.
- Use `.prop` syntax for DOM properties and `on-event` for event handlers in templates.

## Recommended prompt structure

1. Provide a short summary of the requested change or feature.
2. Provide the target file(s) and any existing code to modify (or say "new file").
3. State constraints (supported browsers, shadow DOM required, no external deps).
4. Ask for a concise patch/diff or the full file contents.

Example prompt:

"Add a `todo-list` web component using BedrockJS: file `src/components/todo-list.js`. Use `static tag = 'todo-list'`, support adding/removing items, persist to `localStorage`, and render with `keyed()`; keep shadow DOM off. Return the full file contents."

## Common code snippets

Imports (main entry or specific):

```javascript
import {
  html,
  render,
  keyed,
  Component,
  reactive,
  watch,
  computed,
  signal,
  batch,
  Router,
  createRouter,
  navigate
} from 'bedrockjs';
```

Or targeted imports:

```javascript
import { html } from 'bedrockjs/html';
import { Component } from 'bedrockjs/component';
```

Component template (minimal):

```javascript
class MyComponent extends Component {
  static tag = 'my-component';
  static properties = { name: { type: String } };

  render() {
    return html`<div>Hello, ${this.name}</div>`;
  }
}

MyComponent.register();
```

Template patterns:

- Property binding: `html` with `.prop` (e.g., `.value=${...}`)
- Event binding: `on-event` (e.g., `on-click=${handleClick}`)
- Conditional rendering: ternary or logical `&&`
- List rendering: `items.map(...)` and `keyed(item.id, html`...`)`

## Example tasks for agents

- Create a new component file with `static tag` and `properties`.
- Convert an existing vanilla JS widget into a BedrockJS `Component`.
- Add unit-test-friendly hooks: small, pure render functions.
- Migrate templates to use `.prop` for DOM properties and `keyed` for lists.

## Safety & style notes

- Use function factories for array/object default properties (e.g., `default: () => []`).
- Avoid mutating inputs in render; update reactive state via setters.
- Keep `shadow` opt-in; default components are light DOM unless `static shadow = true`.

## Deno-First Development

BedrockJS is **Deno-native** and published on JSR (https://jsr.io/@rendly/bedrockjs).

### Getting Started with Deno

Install BedrockJS:

```bash
deno add jsr:@rendly/bedrockjs
```

This adds the dependency to `deno.json`. All imports are TypeScript-ready by default.

### Deno Imports

```typescript
import { html, Component, keyed } from '@rendly/bedrockjs';
import { reactive, watch, computed } from '@rendly/bedrockjs/reactive';
import { createRouter, navigate } from '@rendly/bedrockjs/router';

// With TypeScript generics
import { syncedModel } from '@rendly/bedrockjs/sync';
const User = syncedModel<{ id: string; name: string }>('user', {
  name: String,
});
```

### Sync Module (Server-Side)

For offline-first, real-time data sync on the server:

```typescript
// deno.json
{
  "imports": {
    "bedrockjs": "jsr:@rendly/bedrockjs",
    "bedrockjs/sync/server": "jsr:@rendly/bedrockjs/sync/server"
  }
}
```

Server setup:

```typescript
import { serve } from 'std/http/server.ts';
import { createSyncServer } from 'bedrockjs/sync/server';

// Use Deno KV (default, no setup needed)
const syncServer = createSyncServer({
  adapter: 'deno-kv',  // or custom adapter
  scope: (req) => {
    const user = req.headers.get('x-user-id');
    return user || null;
  }
});

serve((req: Request) => {
  if (req.url.startsWith('/sync/')) {
    return syncServer(req);
  }
  return new Response('Not found', { status: 404 });
}, { port: 3000 });
```

Run with unstable Deno KV:

```bash
deno run --unstable-kv --allow-net server.ts
```

For SQLite adapter:

```bash
deno add jsr:@db/sqlite
```

Then:

```typescript
import { createSyncServer, sqliteAdapter } from 'bedrockjs/sync/server';

const syncServer = createSyncServer({
  adapter: sqliteAdapter('./data.db'),
});
```

### Testing & Tasks

```bash
# Run tests (BedrockJS includes sync unit tests)
deno task test

# Run a Deno server (e.g., example sync app)
deno task sync:dev
```

Example `deno.json` tasks:

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read ...",
    "test": "deno test --allow-read --allow-write --allow-env --allow-net --allow-ffi --unstable-kv src/sync/__tests__/",
    "sync:dev": "deno run --unstable-kv --allow-net --allow-read --allow-env examples/sync/server.ts"
  }
}
```

### Prompt Template for Deno + BedrockJS

"Create a Deno server using BedrockJS Sync:
- File: `new file: src/server.ts`
- Use Deno KV for storage (default)
- Add a scope hook for multi-tenant isolation
- Return full TypeScript file, ready to `deno run --unstable-kv --allow-net`"

---

For more complete API examples and edge cases, see `LLMS.md` in this repo.
