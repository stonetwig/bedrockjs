import type { TemplateResult } from './html.d.ts';

export function render(result: TemplateResult, container: Element): void;

export function keyed(key: any, template: TemplateResult): TemplateResult;
