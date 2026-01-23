/**
 * Router implementation with async data loading
 */

import { Component, autoRegister } from './component.js';
import { html } from './html.js';
import { render } from './render.js';

/**
 * Router class for managing application routes
 */
export class Router {
  #routes = [];
  #outlet = null;
  #currentRoute = null;
  #currentComponent = null;
  #useHash = false;
  #base = '';

  /**
   * Create a new router
   * @param {Object} options - Router options
   * @param {Array} options.routes - Route definitions
   * @param {boolean} options.hash - Use hash-based routing
   * @param {string} options.base - Base path for routes
   */
  constructor(options = {}) {
    this.#routes = options.routes || [];
    this.#useHash = options.hash || false;
    this.#base = options.base || '';

    // Register router globally for outlet/link components
    Router.instance = this;
  }

  /**
   * Start the router
   */
  start() {
    // Listen for navigation events
    window.addEventListener('popstate', this.#handleNavigation);
    if (this.#useHash) {
      window.addEventListener('hashchange', this.#handleNavigation);
    }

    // Find existing outlet in the DOM
    const existingOutlet = document.querySelector('router-outlet');
    if (existingOutlet) {
      this.setOutlet(existingOutlet);
    }

    // Handle initial route
    this.#handleNavigation();

    return this;
  }

  /**
   * Stop the router
   */
  stop() {
    window.removeEventListener('popstate', this.#handleNavigation);
    if (this.#useHash) {
      window.removeEventListener('hashchange', this.#handleNavigation);
    }
  }

  /**
   * Set the router outlet element
   */
  setOutlet(outlet) {
    this.#outlet = outlet;
    // Trigger navigation to render the current route
    this.#handleNavigation();
  }

  /**
   * Get current path
   */
  get currentPath() {
    if (this.#useHash) {
      return window.location.hash.slice(1) || '/';
    }
    let path = window.location.pathname;
    // Strip base path
    if (this.#base && path.startsWith(this.#base)) {
      path = path.slice(this.#base.length);
    }
    // Handle index.html and trailing slashes
    path = path.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    return path;
  }

  /**
   * Navigate to a path
   * @param {string} path - Path to navigate to
   * @param {Object} options - Navigation options
   */
  navigate(path, options = {}) {
    const fullPath = this.#useHash ? `#${path}` : `${this.#base}${path}`;

    if (options.replace) {
      window.history.replaceState(null, '', fullPath);
    } else {
      window.history.pushState(null, '', fullPath);
    }

    this.#handleNavigation();
  }

  /**
   * Handle navigation event
   */
  #handleNavigation = async () => {
    const path = this.currentPath;
    const matched = this.#matchRoute(path);

    if (!matched) {
      console.warn(`No route matched for path: ${path}`);
      return;
    }

    const { route, params } = matched;
    this.#currentRoute = { ...route, params };

    await this.#renderRoute(route, params);
  };

  /**
   * Match a path to a route
   */
  #matchRoute(path) {
    for (const route of this.#routes) {
      const params = this.#matchPath(route.path, path);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  /**
   * Match a route path pattern against a URL path
   */
  #matchPath(pattern, path) {
    // Convert pattern to regex
    const paramNames = [];
    const regexPattern = pattern
      .replace(/\//g, '\\/')
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    const match = path.match(regex);

    if (!match) return null;

    // Extract params
    const params = {};
    paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });

    return params;
  }

  /**
   * Render a route
   */
  async #renderRoute(route, params) {
    if (!this.#outlet) return;

    // Create route data object
    const routeData = {
      loading: true,
      data: null,
      error: null,
      params
    };

    // Create or reuse component
    let component = this.#currentComponent;

    if (!component || component.tagName.toLowerCase() !== route.component) {
      // Create new component
      component = document.createElement(route.component);
      this.#currentComponent = component;

      // Set initial loading state BEFORE adding to DOM
      // This ensures routeData is available in connectedCallback
      component.routeData = { ...routeData };

      // Clear outlet and add component
      this.#outlet.innerHTML = '';
      this.#outlet.appendChild(component);
    } else {
      // Reusing component, set loading state
      component.routeData = { ...routeData };
    }

    // Run loader if present
    if (route.loader) {
      try {
        const data = await route.loader(params);
        routeData.loading = false;
        routeData.data = data;
      } catch (error) {
        routeData.loading = false;
        routeData.error = error;
      }

      // Update component with loaded data
      component.routeData = { ...routeData };
    } else {
      // No loader, just set not loading
      routeData.loading = false;
      component.routeData = { ...routeData };
    }
  }

  /**
   * Add a route dynamically
   */
  addRoute(route) {
    this.#routes.push(route);
  }

  /**
   * Remove a route
   */
  removeRoute(path) {
    this.#routes = this.#routes.filter(r => r.path !== path);
  }

  /**
   * Get all routes
   */
  get routes() {
    return [...this.#routes];
  }

  /**
   * Check if using hash-based routing
   */
  get useHash() {
    return this.#useHash;
  }
}

// Global router instance
Router.instance = null;

/**
 * Router outlet component - renders the matched route component
 */
export class RouterOutlet extends Component {
  static tag = 'router-outlet';

  connectedCallback() {
    super.connectedCallback();

    if (Router.instance) {
      Router.instance.setOutlet(this);
    }
  }

  render() {
    // Content is managed by the router directly
    return null;
  }
}

// Register router outlet
autoRegister(RouterOutlet);

/**
 * Router link component - navigation links
 */
export class RouterLink extends Component {
  static tag = 'router-link';
  static shadow = true;
  static properties = {
    to: { type: String },
    replace: { type: Boolean, default: false }
  };

  #handleClick = (e) => {
    e.preventDefault();

    if (Router.instance && this.to) {
      Router.instance.navigate(this.to, { replace: this.replace });
    }
  };

  get href() {
    if (!this.to) return '#';
    if (Router.instance && Router.instance.useHash) {
      return `#${this.to}`;
    }
    return this.to;
  }

  render() {
    return html`
      <style>
        :host {
          display: block;
        }
        a {
          color: inherit;
          text-decoration: inherit;
          display: block;
          cursor: pointer;
        }
      </style>
      <a href="${this.href}" on-click=${this.#handleClick}>
        <slot></slot>
      </a>
    `;
  }
}

// Register router link
autoRegister(RouterLink);

/**
 * Helper to create a router and start it
 */
export function createRouter(options) {
  const router = new Router(options);
  return router.start();
}

/**
 * Navigate programmatically
 */
export function navigate(path, options) {
  if (Router.instance) {
    Router.instance.navigate(path, options);
  } else {
    console.warn('No router instance found');
  }
}

/**
 * Get current route params
 */
export function getParams() {
  if (Router.instance && Router.instance.currentRoute) {
    return Router.instance.currentRoute.params;
  }
  return {};
}
