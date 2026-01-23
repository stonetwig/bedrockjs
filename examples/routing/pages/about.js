import { html, Component } from '../../../src/index.js';

class AboutPage extends Component {
  static tag = 'about-page';

  render() {
    return html`
      <div>
        <h1>About BedrockJS</h1>

        <p>
          BedrockJS is a lightweight web framework built on web components.
          It provides a modern development experience with minimal overhead.
        </p>

        <h2>Core Concepts</h2>

        <h3>Templates</h3>
        <p>
          Use tagged template literals for declarative UI:
        </p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;"><code>html\`
  &lt;div class=\${className}&gt;
    &lt;button on-click=\${handler}&gt;Click me&lt;/button&gt;
  &lt;/div&gt;
\`</code></pre>

        <h3>Components</h3>
        <p>
          Extend the Component class to create custom elements:
        </p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;"><code>class MyComponent extends Component {
  static tag = 'my-component';
  static properties = {
    name: { type: String, default: 'World' }
  };

  render() {
    return html\`&lt;h1&gt;Hello, \${this.name}!&lt;/h1&gt;\`;
  }
}
MyComponent.register();</code></pre>

        <h3>Reactive State</h3>
        <p>
          Use reactive() to create observable state:
        </p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;"><code>const state = reactive({ count: 0 });

watch(() => {
  console.log('Count changed:', state.count);
});

state.count++; // Triggers the watcher</code></pre>

        <h3>Routing</h3>
        <p>
          Define routes with async data loaders:
        </p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;"><code>const router = createRouter({
  routes: [
    {
      path: '/users/:id',
      component: 'user-page',
      loader: async ({ id }) => fetchUser(id)
    }
  ]
});</code></pre>

        <p style="margin-top: 2rem; color: #666;">
          This page doesn't have a data loader, so it renders immediately without a loading state.
        </p>
      </div>
    `;
  }
}

AboutPage.register();
