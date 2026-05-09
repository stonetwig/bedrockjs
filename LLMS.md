# BedrockJS - LLM Reference Documentation

This document provides comprehensive information for LLMs to generate code using the BedrockJS framework. It includes all APIs, patterns, and common use cases.

## Framework Overview

BedrockJS is a lightweight web framework with six core modules:

1. **html.js** - Tagged template literal parser
2. **render.js** - DOM rendering engine
3. **component.js** - Web Component base class
4. **reactive.js** - Reactive state management
5. **router.js** - Client-side router
6. **sync/** - Offline-first data sync (IndexedDB + HTTP ops + SSE)

## Import Patterns

```javascript
// Import everything from main entry
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
  RouterOutlet,
  RouterLink,
  createRouter,
  navigate
} from 'bedrockjs';

// Sync imports
import { syncedModel, configureSync } from 'bedrockjs/sync';
import { createSyncServer, denoKvAdapter } from 'bedrockjs/sync/server';

// Or import from specific modules
import { html } from 'bedrockjs/html';
import { Component } from 'bedrockjs/component';
import { reactive, watch } from 'bedrockjs/reactive';
import { createRouter, navigate } from 'bedrockjs/router';
import { syncedModel, configureSync } from 'bedrockjs/sync';
```

---

## Templates (`html.js`)

### Basic Usage

```javascript
import { html } from 'bedrockjs';

// Simple template
const greeting = html`<h1>Hello World</h1>`;

// With interpolation
const name = 'Alice';
const personalized = html`<h1>Hello, ${name}!</h1>`;

// Nested templates
const wrapper = html`
  <div class="container">
    ${greeting}
  </div>
`;
```

### Attribute Binding

```javascript
// String attributes
html`<div class=${className}></div>`
html`<img src=${imageUrl} alt=${altText}>`

// Boolean attributes (removed if false/null/undefined)
html`<button disabled=${isDisabled}>Click</button>`
html`<input readonly=${isReadonly}>`

// Multiple classes
html`<div class=${'btn ' + (active ? 'active' : '')}></div>`
```

### Property Binding (`.prop`)

Use dot prefix to set DOM properties instead of attributes:

```javascript
// Set the value property (not attribute)
html`<input .value=${inputValue}>`

// Set checked property
html`<input type="checkbox" .checked=${isChecked}>`

// Set any DOM property
html`<video .currentTime=${seekTime}></video>`
```

### Event Binding (`on-event`)

```javascript
// Click handler
html`<button on-click=${handleClick}>Click me</button>`

// With event object
html`<input on-input=${(e) => setValue(e.target.value)}>`

// Multiple events
html`
  <input
    on-focus=${handleFocus}
    on-blur=${handleBlur}
    on-keydown=${handleKeyDown}
  >
`

// Prevent default
html`<form on-submit=${(e) => { e.preventDefault(); handleSubmit(); }}>`

// Arrow function for passing data
html`<button on-click=${() => deleteItem(item.id)}>Delete</button>`
```

### Conditional Rendering

```javascript
// Ternary operator
html`
  <div>
    ${isLoggedIn
      ? html`<span>Welcome, ${username}</span>`
      : html`<a href="/login">Log in</a>`
    }
  </div>
`

// Logical AND for showing/hiding
html`
  <div>
    ${hasError && html`<p class="error">${errorMessage}</p>`}
  </div>
`

// Null/undefined renders nothing
html`<div>${maybeContent}</div>`
```

### List Rendering

```javascript
import { html, keyed } from 'bedrockjs';

// Simple list
html`
  <ul>
    ${items.map(item => html`<li>${item}</li>`)}
  </ul>
`

// Keyed list (for efficient updates)
html`
  <ul>
    ${items.map(item =>
      keyed(item.id, html`<li>${item.name}</li>`)
    )}
  </ul>
`

// List with index
html`
  <ul>
    ${items.map((item, index) =>
      html`<li>${index + 1}. ${item.name}</li>`
    )}
  </ul>
`

// Filtered list
html`
  <ul>
    ${items
      .filter(item => item.active)
      .map(item => keyed(item.id, html`<li>${item.name}</li>`))
    }
  </ul>
`
```

### Template Composition

```javascript
// Helper function returning template
function renderCard(title, content) {
  return html`
    <div class="card">
      <h2>${title}</h2>
      <p>${content}</p>
    </div>
  `;
}

// Use in template
html`
  <div class="cards">
    ${renderCard('First', 'Content 1')}
    ${renderCard('Second', 'Content 2')}
  </div>
`
```

---

## Components (`component.js`)

### Basic Component Structure

```javascript
import { html, Component } from 'bedrockjs';

class MyComponent extends Component {
  // REQUIRED: Custom element tag name (must contain hyphen)
  static tag = 'my-component';

  // OPTIONAL: Enable Shadow DOM (default: false)
  static shadow = false;

  // OPTIONAL: Reactive properties
  static properties = {
    // Property definitions
  };

  // Constructor (rarely needed)
  constructor() {
    super();
    // Initialize non-reactive state
  }

  // REQUIRED: Return template
  render() {
    return html`<div>Content</div>`;
  }

  // OPTIONAL: Called after each render
  updated() {
    // Side effects after render
  }
}

// REQUIRED: Register the component
MyComponent.register();
```

### Property Definitions

```javascript
class UserProfile extends Component {
  static tag = 'user-profile';

  static properties = {
    // Simple type
    name: { type: String },

    // With default value
    role: { type: String, default: 'user' },

    // Number type
    age: { type: Number, default: 0 },

    // Boolean type
    active: { type: Boolean, default: false },

    // Array with factory default (IMPORTANT: use function for objects/arrays)
    tags: { type: Array, default: () => [] },

    // Object with factory default
    settings: { type: Object, default: () => ({}) },

    // No type (any value)
    data: { default: null }
  };

  render() {
    return html`
      <div class="profile ${this.active ? 'active' : ''}">
        <h1>${this.name}</h1>
        <span class="role">${this.role}</span>
        <span class="age">${this.age} years old</span>
        <ul>
          ${this.tags.map(tag => html`<li>${tag}</li>`)}
        </ul>
      </div>
    `;
  }
}

UserProfile.register();
```

Usage in HTML:

```html
<!-- Properties from attributes -->
<user-profile
  name="John Doe"
  role="admin"
  age="30"
  active
></user-profile>

<!-- Note: Arrays/Objects must be set via JavaScript -->
<script>
  const profile = document.querySelector('user-profile');
  profile.tags = ['developer', 'designer'];
  profile.settings = { theme: 'dark' };
</script>
```

### Methods and Event Handlers

```javascript
class TodoItem extends Component {
  static tag = 'todo-item';

  static properties = {
    text: { type: String },
    completed: { type: Boolean, default: false }
  };

  // Method as arrow function (auto-bound to instance)
  toggle = () => {
    this.completed = !this.completed;
  };

  // Method as arrow function with parameter
  handleEdit = (newText) => {
    this.text = newText;
  };

  // Method for complex logic
  handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      this.dispatchEvent(new CustomEvent('save', {
        detail: { text: this.text },
        bubbles: true
      }));
    }
  };

  render() {
    return html`
      <div class="todo ${this.completed ? 'done' : ''}">
        <input
          type="checkbox"
          .checked=${this.completed}
          on-change=${this.toggle}
        >
        <span>${this.text}</span>
      </div>
    `;
  }
}

TodoItem.register();
```

### Shadow DOM Component

```javascript
class StyledCard extends Component {
  static tag = 'styled-card';
  static shadow = true;  // Enable Shadow DOM

  static properties = {
    title: { type: String }
  };

  render() {
    return html`
      <style>
        /* Styles are encapsulated - won't leak out */
        :host {
          display: block;
          border: 1px solid #ccc;
          border-radius: 8px;
          overflow: hidden;
        }

        :host([variant="primary"]) {
          border-color: blue;
        }

        .header {
          background: #f5f5f5;
          padding: 1rem;
          font-weight: bold;
        }

        .content {
          padding: 1rem;
        }

        /* Style slotted content */
        ::slotted(p) {
          margin: 0;
        }
      </style>

      <div class="header">${this.title}</div>
      <div class="content">
        <slot></slot>
      </div>
    `;
  }
}

StyledCard.register();
```

Usage:

```html
<styled-card title="My Card" variant="primary">
  <p>This content goes into the slot</p>
</styled-card>
```

### Component Lifecycle

```javascript
class LifecycleDemo extends Component {
  static tag = 'lifecycle-demo';

  constructor() {
    super();
    // Element created but not in DOM
    // Properties not yet initialized from attributes
    console.log('constructor');
  }

  connectedCallback() {
    // Called by parent class - don't override without calling super
    super.connectedCallback();
    // Element added to DOM
    // Properties initialized, first render complete
    console.log('connected');

    // Good place for:
    // - Adding global event listeners
    // - Starting timers
    // - Fetching initial data
  }

  disconnectedCallback() {
    // Called by parent class - don't override without calling super
    super.disconnectedCallback();
    // Element removed from DOM
    console.log('disconnected');

    // Good place for:
    // - Removing global event listeners
    // - Clearing timers
    // - Cleanup
  }

  updated() {
    // Called after every render
    console.log('updated');

    // Good place for:
    // - DOM measurements
    // - Third-party library integration
    // - Focus management
  }

  render() {
    console.log('render');
    return html`<div>Content</div>`;
  }
}
```

### Manual Re-render

```javascript
class ManualUpdate extends Component {
  static tag = 'manual-update';

  // Non-reactive property (changes won't trigger re-render)
  internalState = { count: 0 };

  increment = () => {
    this.internalState.count++;
    // Manually trigger re-render
    this.requestUpdate();
  };

  render() {
    return html`
      <button on-click=${this.increment}>
        Count: ${this.internalState.count}
      </button>
    `;
  }
}
```

### Component Communication

```javascript
// Parent component
class TodoList extends Component {
  static tag = 'todo-list';

  static properties = {
    items: { type: Array, default: () => [] }
  };

  handleDelete = (id) => {
    this.items = this.items.filter(item => item.id !== id);
  };

  handleToggle = (id) => {
    this.items = this.items.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    );
  };

  render() {
    return html`
      <ul>
        ${this.items.map(item => html`
          <todo-item
            text=${item.text}
            done=${item.done}
            on-delete=${() => this.handleDelete(item.id)}
            on-toggle=${() => this.handleToggle(item.id)}
          ></todo-item>
        `)}
      </ul>
    `;
  }
}

// Child component
class TodoItem extends Component {
  static tag = 'todo-item';

  static properties = {
    text: { type: String },
    done: { type: Boolean }
  };

  emitDelete = () => {
    this.dispatchEvent(new CustomEvent('delete', { bubbles: true }));
  };

  emitToggle = () => {
    this.dispatchEvent(new CustomEvent('toggle', { bubbles: true }));
  };

  render() {
    return html`
      <li class=${this.done ? 'done' : ''}>
        <input type="checkbox" .checked=${this.done} on-change=${this.emitToggle}>
        <span>${this.text}</span>
        <button on-click=${this.emitDelete}>X</button>
      </li>
    `;
  }
}
```

---

## Reactive State (`reactive.js`)

### reactive()

Creates a reactive proxy that triggers updates when properties change:

```javascript
import { reactive, watch } from 'bedrockjs';

// Create reactive state
const state = reactive({
  user: null,
  items: [],
  settings: {
    theme: 'light',
    notifications: true
  }
});

// Reading properties
console.log(state.settings.theme); // 'light'

// Writing properties (triggers watchers)
state.user = { name: 'Alice' };
state.items.push({ id: 1, text: 'Item 1' });
state.settings.theme = 'dark';

// Nested objects are automatically reactive
state.settings.notifications = false; // Also triggers watchers
```

### watch()

Runs a function and re-runs it when reactive dependencies change:

```javascript
import { reactive, watch } from 'bedrockjs';

const state = reactive({ count: 0 });

// Basic watcher
const stop = watch(() => {
  console.log('Count is:', state.count);
});
// Immediately logs: "Count is: 0"

state.count = 5;
// Logs: "Count is: 5"

// Stop watching
stop();

state.count = 10;
// Nothing logged (watcher stopped)
```

Options:

```javascript
// Don't run immediately
watch(() => {
  console.log(state.count);
}, { immediate: false });
```

### computed()

Creates a cached computed value:

```javascript
import { reactive, computed } from 'bedrockjs';

const state = reactive({
  items: [
    { name: 'Apple', price: 1.00 },
    { name: 'Banana', price: 0.50 }
  ],
  taxRate: 0.1
});

const total = computed(() => {
  const subtotal = state.items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * (1 + state.taxRate);
});

console.log(total.value); // 1.65

state.taxRate = 0.2;
console.log(total.value); // 1.80 (automatically recalculated)

// Stop computed
total.stop();
```

### signal()

Simple reactive value with getter/setter:

```javascript
import { signal, watch } from 'bedrockjs';

const [getCount, setCount] = signal(0);

watch(() => {
  console.log('Count:', getCount());
});

setCount(5); // Logs: "Count: 5"
setCount(getCount() + 1); // Logs: "Count: 6"
```

### batch()

Batch multiple updates into single flush:

```javascript
import { reactive, watch, batch } from 'bedrockjs';

const state = reactive({ a: 0, b: 0 });

watch(() => {
  console.log('Updated:', state.a, state.b);
});
// Logs: "Updated: 0 0"

// Without batch: triggers watcher twice
state.a = 1;
state.b = 2;
// Logs: "Updated: 1 0"
// Logs: "Updated: 1 2"

// With batch: triggers watcher once
batch(() => {
  state.a = 10;
  state.b = 20;
});
// Logs: "Updated: 10 20"
```

### Using Reactive State with Components

```javascript
import { html, Component, reactive, watch } from 'bedrockjs';

// Global state
const store = reactive({
  user: null,
  theme: 'light'
});

class UserStatus extends Component {
  static tag = 'user-status';

  #stopWatch = null;

  connectedCallback() {
    super.connectedCallback();

    // Watch store changes and re-render
    this.#stopWatch = watch(() => {
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopWatch?.();
  }

  render() {
    return html`
      <div class="status theme-${store.theme}">
        ${store.user
          ? html`<span>Logged in as ${store.user.name}</span>`
          : html`<span>Not logged in</span>`
        }
      </div>
    `;
  }
}

// Update from anywhere
store.user = { name: 'Alice' };
store.theme = 'dark';
```

---

## Sync Engine (`sync/*`)

BedrockJS Sync provides optimistic local writes, persistence in IndexedDB, HTTP
op batching, and real-time server updates over Server-Sent Events (SSE).

### Client Setup

```javascript
import { syncedModel, configureSync } from 'bedrockjs/sync';

// Call before the first syncedModel(...) call.
configureSync({
  baseUrl: '/sync',          // default is same-origin /sync
  dbName: 'my-app-sync-db',  // optional; defaults to bedrockjs-sync
});

const Todo = syncedModel('todo', {
  fields: {
    id: 'string',
    title: 'string',
    completed: 'boolean',
    createdAt: 'datetime',
    updatedAt: 'datetime',
  },
});
```

### Synced Model API

```javascript
await Todo.create({
  id: crypto.randomUUID(),
  title: 'Ship release',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await Todo.update(id, { completed: true, updatedAt: new Date() });
await Todo.delete(id);

const one = Todo.get(id);      // item | undefined
const all = Todo.all();        // reactive array
const open = Todo.where(t => !t.completed);
```

### Server Setup (Deno)

```typescript
import { createSyncServer, denoKvAdapter } from 'bedrockjs/sync/server';

const sync = await createSyncServer({
  storage: denoKvAdapter({ path: ':memory:' }),
  models: ['todo', 'counter', 'message'],
  basePath: '/sync',
  cors: true,
});

Deno.serve((req: Request) => sync(req), { port: 3000 });
```

### Server Routes

- `POST /sync/:model/ops` - apply batched create/update/delete operations
- `GET /sync/:model/stream?since=N` - SSE stream of subsequent changes
- `GET /sync/:model/snapshot?since=N` - JSON changes since cursor

### Important Notes

- Use same-origin `baseUrl: '/sync'` when serving app + sync API from one port.
- If running multiple sync demos side-by-side, use separate `dbName` values to
  avoid IndexedDB object-store schema conflicts.
- Remote SSE updates are applied to local IndexedDB and automatically propagate
  to reactive UI reads from `Model.get(...)`, `Model.all()`, and `Model.where(...)`.

---

## Router (`router.js`)

### Basic Setup

```javascript
import { createRouter } from 'bedrockjs';

// Import page components
import './pages/home.js';
import './pages/about.js';
import './pages/users.js';

const router = createRouter({
  routes: [
    { path: '/', component: 'home-page' },
    { path: '/about', component: 'about-page' },
    { path: '/users', component: 'users-page' },
    { path: '/users/:id', component: 'user-detail' }
  ]
});
```

HTML:

```html
<nav>
  <router-link to="/">Home</router-link>
  <router-link to="/about">About</router-link>
  <router-link to="/users">Users</router-link>
</nav>

<router-outlet></router-outlet>
```

### Route with Data Loader

```javascript
const router = createRouter({
  routes: [
    {
      path: '/users',
      component: 'users-page',
      loader: async () => {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Failed to load users');
        return response.json();
      }
    },
    {
      path: '/users/:id',
      component: 'user-detail',
      loader: async ({ id }) => {
        const response = await fetch(`/api/users/${id}`);
        if (!response.ok) throw new Error('User not found');
        return response.json();
      }
    }
  ]
});
```

### Route Component with Data

```javascript
class UsersPage extends Component {
  static tag = 'users-page';

  render() {
    // routeData is set by the router
    const { loading, data, error, params } = this.routeData || {};

    // Loading state
    if (loading) {
      return html`
        <div class="loading">
          <span class="spinner"></span>
          Loading users...
        </div>
      `;
    }

    // Error state
    if (error) {
      return html`
        <div class="error">
          <h2>Error</h2>
          <p>${error.message}</p>
          <button on-click=${() => location.reload()}>Retry</button>
        </div>
      `;
    }

    // Success state
    return html`
      <div class="users">
        <h1>Users</h1>
        <ul>
          ${data.map(user => html`
            <li>
              <router-link to="/users/${user.id}">
                ${user.name}
              </router-link>
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

UsersPage.register();
```

### Programmatic Navigation

```javascript
import { navigate } from 'bedrockjs';

class LoginForm extends Component {
  static tag = 'login-form';

  handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await this.login();
      // Navigate after successful login
      navigate('/dashboard');
    } catch (error) {
      this.error = error.message;
    }
  };

  // Navigate with replace (no history entry)
  goBack = () => {
    navigate('/', { replace: true });
  };

  render() {
    return html`
      <form on-submit=${this.handleSubmit}>
        <!-- form fields -->
        <button type="submit">Login</button>
        <button type="button" on-click=${this.goBack}>Cancel</button>
      </form>
    `;
  }
}
```

### Router Configuration Options

```javascript
const router = createRouter({
  // Route definitions
  routes: [...],

  // Base path (for apps deployed to subdirectory)
  base: '/my-app',

  // Use hash-based routing (#/path instead of /path)
  hash: true
});
```

### Router Link Options

```html
<!-- Basic link -->
<router-link to="/about">About</router-link>

<!-- Replace history (no back navigation) -->
<router-link to="/login" replace>Login</router-link>
```

---

## Common Patterns

### Form Handling

```javascript
class ContactForm extends Component {
  static tag = 'contact-form';

  static properties = {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    message: { type: String, default: '' },
    submitting: { type: Boolean, default: false },
    error: { type: String, default: '' }
  };

  handleSubmit = async (e) => {
    e.preventDefault();
    this.submitting = true;
    this.error = '';

    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.name,
          email: this.email,
          message: this.message
        })
      });

      // Reset form
      this.name = '';
      this.email = '';
      this.message = '';

      this.dispatchEvent(new CustomEvent('submitted'));
    } catch (err) {
      this.error = err.message;
    } finally {
      this.submitting = false;
    }
  };

  render() {
    return html`
      <form on-submit=${this.handleSubmit}>
        ${this.error && html`<div class="error">${this.error}</div>`}

        <label>
          Name:
          <input
            type="text"
            .value=${this.name}
            on-input=${(e) => this.name = e.target.value}
            required
          >
        </label>

        <label>
          Email:
          <input
            type="email"
            .value=${this.email}
            on-input=${(e) => this.email = e.target.value}
            required
          >
        </label>

        <label>
          Message:
          <textarea
            .value=${this.message}
            on-input=${(e) => this.message = e.target.value}
            required
          ></textarea>
        </label>

        <button type="submit" disabled=${this.submitting}>
          ${this.submitting ? 'Sending...' : 'Send'}
        </button>
      </form>
    `;
  }
}
```

### Modal Dialog

```javascript
class ModalDialog extends Component {
  static tag = 'modal-dialog';
  static shadow = true;

  static properties = {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' }
  };

  close = () => {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  };

  handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      this.close();
    }
  };

  render() {
    if (!this.open) return html``;

    return html`
      <style>
        .backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          min-width: 300px;
          max-width: 90vw;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
        }
      </style>

      <div class="backdrop" on-click=${this.handleBackdropClick}>
        <div class="modal">
          <div class="header">
            <h2>${this.title}</h2>
            <button class="close-btn" on-click=${this.close}>&times;</button>
          </div>
          <div class="content">
            <slot></slot>
          </div>
        </div>
      </div>
    `;
  }
}
```

### Data Table

```javascript
class DataTable extends Component {
  static tag = 'data-table';

  static properties = {
    columns: { type: Array, default: () => [] },
    data: { type: Array, default: () => [] },
    sortColumn: { type: String, default: '' },
    sortDirection: { type: String, default: 'asc' }
  };

  handleSort = (column) => {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  };

  get sortedData() {
    if (!this.sortColumn) return this.data;

    return [...this.data].sort((a, b) => {
      const aVal = a[this.sortColumn];
      const bVal = b[this.sortColumn];

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  render() {
    return html`
      <table>
        <thead>
          <tr>
            ${this.columns.map(col => html`
              <th on-click=${() => this.handleSort(col.key)}>
                ${col.label}
                ${this.sortColumn === col.key
                  ? (this.sortDirection === 'asc' ? ' ▲' : ' ▼')
                  : ''
                }
              </th>
            `)}
          </tr>
        </thead>
        <tbody>
          ${this.sortedData.map(row => html`
            <tr>
              ${this.columns.map(col => html`
                <td>${row[col.key]}</td>
              `)}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}
```

### Async Data Loading Component

```javascript
class AsyncLoader extends Component {
  static tag = 'async-loader';

  static properties = {
    src: { type: String },
    loading: { type: Boolean, default: false },
    data: { type: Object, default: null },
    error: { type: String, default: '' }
  };

  // Watch for src changes
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === 'src' && newValue !== oldValue) {
      this.loadData();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.src) {
      this.loadData();
    }
  }

  async loadData() {
    if (!this.src) return;

    this.loading = true;
    this.error = '';

    try {
      const response = await fetch(this.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.data = await response.json();
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading...</div>`;
    }

    if (this.error) {
      return html`
        <div class="error">
          Error: ${this.error}
          <button on-click=${() => this.loadData()}>Retry</button>
        </div>
      `;
    }

    if (!this.data) {
      return html`<div class="empty">No data</div>`;
    }

    return html`
      <slot></slot>
    `;
  }
}
```

---

## File Structure Conventions

```
my-app/
├── src/
│   ├── index.js           # Main entry, imports and initializes app
│   ├── app.js             # App shell component
│   ├── router.js          # Router configuration
│   ├── store.js           # Global reactive state
│   ├── components/        # Reusable components
│   │   ├── button.js
│   │   ├── modal.js
│   │   └── form-input.js
│   ├── pages/             # Route page components
│   │   ├── home.js
│   │   ├── about.js
│   │   └── users/
│   │       ├── list.js
│   │       └── detail.js
│   └── utils/             # Utility functions
│       ├── api.js
│       └── format.js
├── index.html
└── package.json
```

---

## Complete Example App

```javascript
// src/store.js
import { reactive } from 'bedrockjs';

export const store = reactive({
  user: null,
  todos: []
});

export const actions = {
  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    store.user = await res.json();
  },

  logout() {
    store.user = null;
  },

  async loadTodos() {
    const res = await fetch('/api/todos');
    store.todos = await res.json();
  },

  async addTodo(text) {
    const res = await fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    const todo = await res.json();
    store.todos = [...store.todos, todo];
  },

  async toggleTodo(id) {
    const todo = store.todos.find(t => t.id === id);
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !todo.done })
    });
    const updated = await res.json();
    store.todos = store.todos.map(t => t.id === id ? updated : t);
  },

  async deleteTodo(id) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    store.todos = store.todos.filter(t => t.id !== id);
  }
};
```

```javascript
// src/components/todo-list.js
import { html, Component, watch } from 'bedrockjs';
import { store, actions } from '../store.js';

class TodoList extends Component {
  static tag = 'todo-list';

  static properties = {
    newTodo: { type: String, default: '' }
  };

  #stopWatch = null;

  connectedCallback() {
    super.connectedCallback();
    actions.loadTodos();

    this.#stopWatch = watch(() => {
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopWatch?.();
  }

  handleAdd = async (e) => {
    e.preventDefault();
    if (this.newTodo.trim()) {
      await actions.addTodo(this.newTodo);
      this.newTodo = '';
    }
  };

  render() {
    return html`
      <div class="todo-list">
        <form on-submit=${this.handleAdd}>
          <input
            type="text"
            placeholder="What needs to be done?"
            .value=${this.newTodo}
            on-input=${(e) => this.newTodo = e.target.value}
          >
          <button type="submit">Add</button>
        </form>

        <ul>
          ${store.todos.map(todo => html`
            <li class=${todo.done ? 'done' : ''}>
              <input
                type="checkbox"
                .checked=${todo.done}
                on-change=${() => actions.toggleTodo(todo.id)}
              >
              <span>${todo.text}</span>
              <button on-click=${() => actions.deleteTodo(todo.id)}>
                Delete
              </button>
            </li>
          `)}
        </ul>

        <p>${store.todos.filter(t => !t.done).length} items left</p>
      </div>
    `;
  }
}

TodoList.register();
```

```javascript
// src/router.js
import { createRouter } from 'bedrockjs';

import './pages/home.js';
import './pages/login.js';
import './pages/todos.js';

export const router = createRouter({
  routes: [
    { path: '/', component: 'home-page' },
    { path: '/login', component: 'login-page' },
    { path: '/todos', component: 'todos-page' }
  ]
});
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Todo App</title>
</head>
<body>
  <nav>
    <router-link to="/">Home</router-link>
    <router-link to="/todos">Todos</router-link>
  </nav>

  <main>
    <router-outlet></router-outlet>
  </main>

  <script type="module" src="./src/router.js"></script>
</body>
</html>
```
