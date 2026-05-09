import type { TemplateResult } from './html.d.ts';

export interface ComponentPropertyConfig<T = any> {
  type?: { new (...args: any[]): T } | Function;
  default?: T | (() => T);
}

export type ComponentProperties = Record<string, ComponentPropertyConfig | Function>;

export class Component extends HTMLElement {
  static tag: string | null;
  static shadow: boolean;
  static properties: ComponentProperties;
  static autoRegister: boolean;

  readonly renderRoot: Element | ShadowRoot;

  routeData: any;

  render(): TemplateResult | null;
  updated(): void;
  requestUpdate(): void;

  static register(tagName?: string): typeof Component;
}

export function defineComponent(
  tag: string,
  options?: {
    shadow?: boolean;
    properties?: ComponentProperties;
    autoRegister?: boolean;
  }
): <T extends typeof Component>(ComponentClass: T) => T;

export function autoRegister<T extends typeof Component>(ComponentClass: T): T;
