import type { TemplateResult } from './html.js';

export function render(result: TemplateResult, container: Element): void;

export function keyed(key: any, template: TemplateResult): TemplateResult;
