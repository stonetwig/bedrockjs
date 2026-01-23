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

---

For more complete API examples and edge cases, see `LLMS.md` in this repo.
