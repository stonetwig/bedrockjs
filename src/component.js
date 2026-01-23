/**
 * Base Component class for creating web components
 */

import { render } from './render.js';
import { watch } from './reactive.js';

// Registry of defined components
const componentRegistry = new Map();

/**
 * Base class for creating reactive web components
 */
export class Component extends HTMLElement {
  // Override in subclass to set custom tag name
  static tag = null;

  // Set to true to use Shadow DOM
  static shadow = false;

  // Define reactive properties
  static properties = {};

  // Set to false to disable auto-registration
  static autoRegister = true;

  // Store for property values
  #props = {};

  // Watcher cleanup function
  #stopWatch = null;

  // Render root (shadow or light DOM)
  #renderRoot = null;

  // Whether component is connected
  #connected = false;

  // Pending render flag
  #pendingRender = false;

  // Route data from router
  #routeData = null;

  constructor() {
    super();

    // Initialize shadow DOM if enabled
    if (this.constructor.shadow) {
      this.#renderRoot = this.attachShadow({ mode: 'open' });
    } else {
      this.#renderRoot = this;
    }

    // Initialize reactive properties
    this.#initializeProperties();
  }

  /**
   * Initialize reactive properties from static definition
   */
  #initializeProperties() {
    const properties = this.constructor.properties;

    for (const [name, config] of Object.entries(properties)) {
      const normalizedConfig = typeof config === 'function'
        ? { type: config }
        : config;

      // Set default value
      if (normalizedConfig.default !== undefined) {
        this.#props[name] = typeof normalizedConfig.default === 'function'
          ? normalizedConfig.default()
          : normalizedConfig.default;
      } else {
        this.#props[name] = undefined;
      }

      // Define getter/setter
      Object.defineProperty(this, name, {
        get: () => this.#props[name],
        set: (value) => {
          const oldValue = this.#props[name];
          const coerced = this.#coerceValue(value, normalizedConfig.type);

          if (oldValue !== coerced) {
            this.#props[name] = coerced;
            this.#scheduleRender();
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  }

  /**
   * Coerce value to the specified type
   */
  #coerceValue(value, type) {
    if (value === null || value === undefined) {
      return value;
    }

    if (!type) return value;

    switch (type) {
      case String:
        return String(value);
      case Number:
        return Number(value);
      case Boolean:
        return Boolean(value);
      case Array:
        return Array.isArray(value) ? value : [value];
      case Object:
        return typeof value === 'object' ? value : { value };
      default:
        return value;
    }
  }

  /**
   * Get the render root (shadow DOM or this element)
   */
  get renderRoot() {
    return this.#renderRoot;
  }

  /**
   * Get route data
   */
  get routeData() {
    return this.#routeData;
  }

  /**
   * Set route data (called by router)
   */
  set routeData(data) {
    this.#routeData = data;
    this.#scheduleRender();
  }

  /**
   * Called when element is connected to DOM
   */
  connectedCallback() {
    this.#connected = true;

    // Read attributes into properties
    this.#readAttributes();

    // Initial render
    this.#doRender();

    // Set up reactive watching
    this.#stopWatch = watch(() => {
      this.#doRender();
    }, { immediate: false });
  }

  /**
   * Called when element is disconnected from DOM
   */
  disconnectedCallback() {
    this.#connected = false;

    if (this.#stopWatch) {
      this.#stopWatch();
      this.#stopWatch = null;
    }
  }

  /**
   * Read attributes into properties
   */
  #readAttributes() {
    const properties = this.constructor.properties;

    for (const [name, config] of Object.entries(properties)) {
      const normalizedConfig = typeof config === 'function'
        ? { type: config }
        : config;

      // Convert property name to attribute name (camelCase -> kebab-case)
      const attrName = name.replace(/([A-Z])/g, '-$1').toLowerCase();

      if (this.hasAttribute(attrName)) {
        const attrValue = this.getAttribute(attrName);
        this[name] = this.#parseAttributeValue(attrValue, normalizedConfig.type);
      }
    }
  }

  /**
   * Parse attribute string value based on type
   */
  #parseAttributeValue(value, type) {
    if (!type) return value;

    switch (type) {
      case Boolean:
        return value !== null && value !== 'false';
      case Number:
        return Number(value);
      case Array:
      case Object:
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Observe attribute changes
   */
  static get observedAttributes() {
    const properties = this.properties || {};
    return Object.keys(properties).map(name =>
      name.replace(/([A-Z])/g, '-$1').toLowerCase()
    );
  }

  /**
   * Called when an observed attribute changes
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    // Convert attribute name to property name (kebab-case -> camelCase)
    const propName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    if (propName in this.constructor.properties) {
      const config = this.constructor.properties[propName];
      const normalizedConfig = typeof config === 'function'
        ? { type: config }
        : config;

      this[propName] = this.#parseAttributeValue(newValue, normalizedConfig.type);
    }
  }

  /**
   * Schedule a render on next microtask
   */
  #scheduleRender() {
    if (!this.#connected || this.#pendingRender) return;

    this.#pendingRender = true;
    queueMicrotask(() => {
      this.#pendingRender = false;
      if (this.#connected) {
        this.#doRender();
      }
    });
  }

  /**
   * Perform the actual render
   */
  #doRender() {
    const result = this.render();
    if (result) {
      render(result, this.#renderRoot);
    }
    this.updated();
  }

  /**
   * Override to return template result
   * @returns {TemplateResult|null}
   */
  render() {
    return null;
  }

  /**
   * Called after each render
   */
  updated() {
    // Override in subclass
  }

  /**
   * Manually trigger a re-render
   */
  requestUpdate() {
    this.#scheduleRender();
  }

  /**
   * Register this component with the custom elements registry
   * @param {string} [tagName] - Optional tag name override
   */
  static register(tagName) {
    const tag = tagName || this.tag;

    if (!tag) {
      throw new Error('Component must have a tag name');
    }

    if (!customElements.get(tag)) {
      customElements.define(tag, this);
      componentRegistry.set(tag, this);
    }

    return this;
  }
}

/**
 * Decorator/helper to define a component
 * @param {string} tag - Tag name
 * @param {Object} options - Component options
 */
export function defineComponent(tag, options = {}) {
  return (ComponentClass) => {
    ComponentClass.tag = tag;

    if (options.shadow !== undefined) {
      ComponentClass.shadow = options.shadow;
    }

    if (options.properties) {
      ComponentClass.properties = {
        ...ComponentClass.properties,
        ...options.properties
      };
    }

    if (options.autoRegister !== false) {
      ComponentClass.register();
    }

    return ComponentClass;
  };
}

/**
 * Auto-register components when the class is defined
 * Call this after defining your component class
 */
export function autoRegister(ComponentClass) {
  if (ComponentClass.autoRegister && ComponentClass.tag) {
    ComponentClass.register();
  }
  return ComponentClass;
}

// Hook into class definition to auto-register
// This runs when the module is imported
const originalDefine = Object.defineProperty;
