export class TemplateResult {
  strings: TemplateStringsArray;
  values: any[];

  constructor(strings: TemplateStringsArray, values: any[]);

  getTemplate(): any;
}

export function html(strings: TemplateStringsArray, ...values: any[]): TemplateResult;

export function isTemplateResult(value: any): value is TemplateResult;
