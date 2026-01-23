import type { Component } from './component.js';

export interface RouteDefinition {
  path: string;
  component: string;
  loader?: (params: Record<string, string>) => any | Promise<any>;
  [key: string]: any;
}

export interface RouterOptions {
  routes?: RouteDefinition[];
  hash?: boolean;
  base?: string;
}

export interface NavigationOptions {
  replace?: boolean;
}

export class Router {
  constructor(options?: RouterOptions);

  start(): this;
  stop(): void;
  setOutlet(outlet: RouterOutlet | Element): void;

  readonly currentPath: string;
  navigate(path: string, options?: NavigationOptions): void;

  addRoute(route: RouteDefinition): void;
  removeRoute(path: string): void;

  readonly routes: RouteDefinition[];
  readonly useHash: boolean;

  static instance: Router | null;
  currentRoute?: RouteDefinition & { params?: Record<string, string> };
}

export class RouterOutlet extends Component {}

export class RouterLink extends Component {
  to?: string;
  replace: boolean;
  readonly href: string;
}

export function createRouter(options?: RouterOptions): Router;

export function navigate(path: string, options?: NavigationOptions): void;

export function getParams(): Record<string, string>;
