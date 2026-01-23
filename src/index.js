/**
 * BedrockJS - A lightweight web framework built on web components
 *
 * @example
 * import { html, Component, reactive, Router } from 'bedrockjs';
 *
 * class MyCounter extends Component {
 *   static tag = 'my-counter';
 *   static properties = {
 *     count: { type: Number, default: 0 }
 *   };
 *
 *   render() {
 *     return html`
 *       <button on-click=${() => this.count++}>
 *         Count: ${this.count}
 *       </button>
 *     `;
 *   }
 * }
 * MyCounter.register();
 */

// Template system
export { html, TemplateResult, isTemplateResult } from './html.js';

// Rendering
export { render, keyed } from './render.js';

// Component system
export { Component, defineComponent, autoRegister } from './component.js';

// Reactive state
export {
  reactive,
  watch,
  computed,
  signal,
  batch
} from './reactive.js';

// Router
export {
  Router,
  RouterOutlet,
  RouterLink,
  createRouter,
  navigate,
  getParams
} from './router.js';
