import { Component, html } from '../../src/index.js';
import { syncedModel, configureSync } from '../../src/sync/index.js';

configureSync({
  baseUrl: '/sync',
  dbName: 'bedrockjs-sync-counter',
});

const Counter = syncedModel('counter', {
  fields: {
    id: 'string',
    value: 'number',
    label: 'string',
  },
});

// Initialize with a default counter if none exists
async function ensureCounter() {
  const counters = await Counter.all();
  if (counters.length === 0) {
    await Counter.create({
      id: 'main',
      value: 0,
      label: 'Connected Counter',
    });
  }
}

class CounterApp extends Component {
  static tag = 'counter-app';

  constructor() {
    super();
    ensureCounter();
  }

  increment() {
    Counter.update('main', {
      value: (Counter.get('main')?.value ?? 0) + 1,
    });
  }

  decrement() {
    Counter.update('main', {
      value: (Counter.get('main')?.value ?? 0) - 1,
    });
  }

  reset() {
    Counter.update('main', { value: 0 });
  }

  render() {
    const counter = Counter.get('main');
    const value = counter?.value ?? 0;

    return html`
      <div class="counter-display">
        <div class="value">${value}</div>
        <div class="label">${counter?.label ?? 'Loading...'}</div>
      </div>
      <div class="controls">
        <button on-click=${() => this.decrement()} class="btn-minus">−</button>
        <button on-click=${() => this.reset()} class="btn-reset">Reset</button>
        <button on-click=${() => this.increment()} class="btn-plus">+</button>
      </div>
      <p class="hint">Open this page in multiple tabs and watch the counter stay synchronized in real time.</p>
    `;
  }
}

CounterApp.register();
