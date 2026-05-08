![BedrockJS](bedrockjs.png)

A lightweight web framework built on Web Components with lit-html-style templating, reactive state management, and a router with async data fetching.

## Features

- **Tagged Template Literals** - Declarative UI with `html` tagged templates
- **Web Components** - Native custom elements with reactive properties
- **Efficient DOM Updates** - Comment-marker-based patching (no virtual DOM)
- **Reactive State** - Proxy-based reactivity with automatic dependency tracking
- **Router** - History API routing with async data loaders
- **Shadow DOM Support** - Optional style encapsulation per component
- **Zero Dependencies** - Pure JavaScript, no build step required

## Installation

JSR (Deno or `jsr:` import):

```bash
deno add jsr:@rendly/bedrockjs
```

NPM (via JSR CLI):

```bash
npx jsr add @rendly/bedrockjs
```

NPM (via JSR package):

```bash
npm install @jsr/rendly__bedrockjs
```

PNPM:

```bash
pnpm add jsr:@rendly/bedrockjs
```

Yarn:

```bash
yarn add jsr:@rendly/bedrockjs
```

VLT:

```bash
vlt add jsr:@rendly/bedrockjs
```

Or include directly in your HTML:

```html
<script type="module">
  import { html, Component, createRouter } from './src/index.js';
</script>
```

## Quick Start

### Hello World

```javascript
import { html, Component } from '@rendly/bedrockjs';

class HelloWorld extends Component {
  static tag = 'hello-world';
  static properties = {
    name: { type: String, default: 'World' }
  };

  render() {
    return html`<h1>Hello, ${this.name}!</h1>`;
  }
}

HelloWorld.register();
```

```html
<hello-world name="BedrockJS"></hello-world>
```

### Counter with Events

```javascript
import { html, Component } from '@rendly/bedrockjs';

class MyCounter extends Component {
  static tag = 'my-counter';
  static properties = {
    count: { type: Number, default: 0 }
  };

  render() {
    return html`
      <div>
        <p>Count: ${this.count}</p>
        <button on-click=${() => this.count++}>Increment</button>
        <button on-click=${() => this.count--}>Decrement</button>
      </div>
    `;
  }
}

MyCounter.register();
```

## Core Concepts

### Templates

BedrockJS uses tagged template literals for declarative UI:

```javascript
import { html } from '@rendly/bedrockjs';

const template = html`
  <div class=${className}>
    <input .value=${text} on-input=${handleInput}>
    <button on-click=${handleClick}>Submit</button>
    ${items.map(item => html`<li>${item}</li>`)}
  </div>
`;
```

#### Binding Types

| Syntax | Description | Example |
|--------|-------------|---------|
| `${value}` | Text content | `<p>${message}</p>` |
| `attr=${value}` | Attribute | `<div class=${cls}>` |
| `.prop=${value}` | Property | `<input .value=${text}>` |
| `on-event=${fn}` | Event listener | `<button on-click=${handler}>` |

#### Conditional Rendering

```javascript
render() {
  return html`
    <div>
      ${this.isLoading
        ? html`<span>Loading...</span>`
        : html`<span>Ready!</span>`
      }
    </div>
  `;
}
```

#### List Rendering

```javascript
import { html, keyed } from 'bedrockjs';

render() {
  return html`
    <ul>
      ${this.items.map(item =>
        keyed(item.id, html`<li>${item.name}</li>`)
      )}
    </ul>
  `;
}
```

Use `keyed()` for efficient updates when items can be reordered or removed.

### Components

Components extend the `Component` base class:

```javascript
import { html, Component } from 'bedrockjs';

class UserCard extends Component {
  // Required: unique tag name
  static tag = 'user-card';

  // Optional: enable Shadow DOM (default: false)
  static shadow = true;

  // Optional: reactive properties
  static properties = {
    name: { type: String, default: 'Anonymous' },
    age: { type: Number },
    active: { type: Boolean, default: false },
    data: { type: Object, default: () => ({}) }
  };

  // Called after each render
  updated() {
    console.log('Component updated');
  }

  // Return template
  render() {
    return html`
      <div class="card">
        <h2>${this.name}</h2>
        <p>Age: ${this.age}</p>
      </div>
    `;
  }
}

// Register with custom elements
UserCard.register();
```

#### Property Types

| Type | Coercion | Default |
|------|----------|---------|
| `String` | `String(value)` | `undefined` |
| `Number` | `Number(value)` | `undefined` |
| `Boolean` | `Boolean(value)` | `false` |
| `Array` | Pass through | `[]` |
| `Object` | Pass through | `{}` |

Properties are automatically synced with attributes (camelCase to kebab-case):

```html
<user-card name="John" age="30" active></user-card>
```

#### Shadow DOM

Enable Shadow DOM for style encapsulation:

```javascript
class StyledButton extends Component {
  static tag = 'styled-button';
  static shadow = true;

  render() {
    return html`
      <style>
        button {
          background: blue;
          color: white;
          padding: 10px 20px;
        }
      </style>
      <button><slot></slot></button>
    `;
  }
}
```

### Reactive State

For state shared between components or outside component context:

```javascript
import { reactive, watch, computed } from 'bedrockjs';

// Create reactive object
const state = reactive({
  count: 0,
  items: []
});

// Watch for changes
const stopWatch = watch(() => {
  console.log('Count changed:', state.count);
});

// Computed values
const doubled = computed(() => state.count * 2);
console.log(doubled.value); // Access with .value

// Update state (triggers watchers)
state.count++;
state.items.push('new item');

// Stop watching
stopWatch();
```

#### Signals

For simple reactive values:

```javascript
import { signal } from 'bedrockjs';

const [getCount, setCount] = signal(0);

console.log(getCount()); // 0
setCount(5);
console.log(getCount()); // 5
```

#### Batching Updates

```javascript
import { reactive, batch } from 'bedrockjs';

const state = reactive({ a: 1, b: 2 });

// Multiple updates trigger only one flush
batch(() => {
  state.a = 10;
  state.b = 20;
});
```

### Router

Create a single-page application with the router:

```javascript
import { createRouter } from 'bedrockjs';

const router = createRouter({
  // Optional: base path for deployment in subdirectory
  base: '/app',

  routes: [
    {
      path: '/',
      component: 'home-page'
    },
    {
      path: '/users',
      component: 'users-page',
      loader: async () => {
        const res = await fetch('/api/users');
        return res.json();
      }
    },
    {
      path: '/users/:id',
      component: 'user-detail',
      loader: async ({ id }) => {
        const res = await fetch(`/api/users/${id}`);
        return res.json();
      }
    }
  ]
});
```

```html
<nav>
  <router-link to="/">Home</router-link>
  <router-link to="/users">Users</router-link>
</nav>

<main>
  <router-outlet></router-outlet>
</main>
```

#### Route Data

Components receive `routeData` with loading state:

```javascript
class UserDetail extends Component {
  static tag = 'user-detail';

  render() {
    const { loading, data, error, params } = this.routeData || {};

    if (loading) {
      return html`<div>Loading...</div>`;
    }

    if (error) {
      return html`<div>Error: ${error.message}</div>`;
    }

    return html`
      <div>
        <h1>${data.name}</h1>
        <p>ID: ${params.id}</p>
      </div>
    `;
  }
}
```

#### Programmatic Navigation

```javascript
import { navigate } from 'bedrockjs';

// Navigate to a path
navigate('/users/123');

// Replace current history entry
navigate('/login', { replace: true });
```

#### Route Parameters

| Pattern | URL | Params |
|---------|-----|--------|
| `/users/:id` | `/users/123` | `{ id: '123' }` |
| `/posts/:category/:slug` | `/posts/tech/hello` | `{ category: 'tech', slug: 'hello' }` |

## API Reference

### Template Functions

| Function | Description |
|----------|-------------|
| `html` | Tagged template literal for creating templates |
| `render(result, container)` | Render a template into a container |
| `keyed(key, template)` | Create a keyed template for list rendering |

### Component

| Static Property | Type | Description |
|-----------------|------|-------------|
| `tag` | `string` | Custom element tag name (required) |
| `shadow` | `boolean` | Enable Shadow DOM (default: `false`) |
| `properties` | `object` | Reactive property definitions |

| Instance Property | Description |
|-------------------|-------------|
| `renderRoot` | The root element for rendering (shadow root or element) |
| `routeData` | Route data when used with router |

| Method | Description |
|--------|-------------|
| `render()` | Return template (override in subclass) |
| `updated()` | Called after each render |
| `requestUpdate()` | Manually trigger a re-render |
| `static register(tagName?)` | Register the custom element |

### Reactive

| Function | Description |
|----------|-------------|
| `reactive(obj)` | Create a reactive proxy |
| `watch(fn, options?)` | Watch reactive dependencies, returns stop function |
| `computed(fn)` | Create a computed value (access via `.value`) |
| `signal(initial)` | Create a signal, returns `[getter, setter]` |
| `batch(fn)` | Batch multiple updates |

### Router

| Function | Description |
|----------|-------------|
| `createRouter(options)` | Create and start a router |
| `navigate(path, options?)` | Navigate programmatically |

| Router Options | Type | Description |
|----------------|------|-------------|
| `routes` | `array` | Route definitions |
| `base` | `string` | Base path prefix |
| `hash` | `boolean` | Use hash-based routing |

| Route Definition | Type | Description |
|------------------|------|-------------|
| `path` | `string` | URL pattern with optional `:params` |
| `component` | `string` | Tag name of component to render |
| `loader` | `function` | Async function to load data |

## Browser Support

BedrockJS uses modern JavaScript features:
- ES Modules
- Custom Elements v1
- Proxy
- Private class fields

Supported in all modern browsers (Chrome, Firefox, Safari, Edge).

## Development

```bash
# Clone the repository
git clone https://github.com/your-repo/bedrockjs.git
cd bedrockjs

# Install dependencies
npm install

# Start development server
npm run dev

# Open examples
open http://localhost:3000/examples/
```

## Architecture

### How Templates Work

1. **Parse**: The `html` tagged template creates a `TemplateResult` with static strings and dynamic values
2. **Compile**: On first render, strings are joined with comment markers and parsed into a `<template>` element
3. **Walk**: The template DOM is walked to find marker positions and create a parts array
4. **Clone**: The template is cloned for each render instance
5. **Patch**: Only the dynamic parts are updated on subsequent renders

### How Reactivity Works

1. **Proxy**: `reactive()` wraps objects in a Proxy that tracks property access
2. **Track**: When a watcher runs, accessed properties are recorded as dependencies
3. **Trigger**: When a property changes, dependent watchers are queued
4. **Flush**: Queued watchers run in the next microtask (batched)

### How Components Work

1. **Define**: Class extends `Component` with static `tag` and `properties`
2. **Register**: `customElements.define()` registers the element
3. **Connect**: When added to DOM, `connectedCallback` initializes and renders
4. **Update**: Property changes schedule a re-render via microtask
5. **Render**: `render()` returns a template that patches the DOM

## License

MIT
