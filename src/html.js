/**
 * Template literal parser for creating efficient DOM templates
 */

// Unique marker for template parts
const MARKER = `bedrock-${Math.random().toString(36).slice(2)}`;
const COMMENT_MARKER = `<!--${MARKER}-`;
const ATTR_MARKER = `${MARKER}-`;

// Template cache for reusing parsed templates
const templateCache = new WeakMap();

/**
 * Represents a parsed template with static parts and dynamic values
 */
export class TemplateResult {
  constructor(strings, values) {
    this.strings = strings;
    this.values = values;
    this._type = 'template-result';
  }

  /**
   * Get cached template or create new one
   */
  getTemplate() {
    let template = templateCache.get(this.strings);
    if (!template) {
      template = parseTemplate(this.strings);
      templateCache.set(this.strings, template);
    }
    return template;
  }
}

/**
 * Tagged template literal function for creating templates
 * @param {TemplateStringsArray} strings - Static parts
 * @param {...any} values - Dynamic values
 * @returns {TemplateResult}
 */
export function html(strings, ...values) {
  return new TemplateResult(strings, values);
}

/**
 * Check if we're inside an HTML tag (for attribute vs node detection)
 */
function isInsideTag(str) {
  let inTag = false;
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === '>') return false;
    if (str[i] === '<') return true;
  }
  return false;
}

/**
 * Parse template strings into a reusable template structure
 */
function parseTemplate(strings) {
  const parts = [];
  let htmlStr = '';

  for (let i = 0; i < strings.length; i++) {
    htmlStr += strings[i];

    if (i < strings.length - 1) {
      // Check if this expression is inside a tag (attribute) or outside (node)
      if (isInsideTag(htmlStr)) {
        // Attribute position - use attribute marker
        htmlStr += `${ATTR_MARKER}${i}`;
        parts.push({ type: 'attr-pending', index: i });
      } else {
        // Node position - use comment marker
        htmlStr += `${COMMENT_MARKER}${i}-->`;
        parts.push({ type: 'node', index: i });
      }
    }
  }

  // Parse into template element
  const template = document.createElement('template');
  template.innerHTML = htmlStr;

  // Walk the template to resolve part locations
  const resolvedParts = new Array(strings.length - 1).fill(null);
  walkTemplate(template.content, resolvedParts, []);

  return { element: template, parts: resolvedParts };
}

/**
 * Walk the template DOM to find marker positions
 */
function walkTemplate(node, parts, path) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    // Check attributes for markers
    const attrsToRemove = [];
    for (const attr of node.attributes) {
      if (attr.value.includes(ATTR_MARKER) || attr.name.includes(ATTR_MARKER)) {
        const match = (attr.value + attr.name).match(new RegExp(`${ATTR_MARKER}(\\d+)`));
        if (match) {
          const index = parseInt(match[1], 10);
          const name = attr.name.replace(new RegExp(`${ATTR_MARKER}\\d+`), '');
          const isEvent = name.startsWith('on-');
          const isProperty = name.startsWith('.');

          parts[index] = {
            type: isEvent ? 'event' : isProperty ? 'property' : 'attribute',
            path: [...path],
            name: isEvent ? name.slice(3) : isProperty ? name.slice(1) : name,
          };
          attrsToRemove.push(attr.name);
        }
      }
    }
    // Remove marker attributes
    for (const name of attrsToRemove) {
      node.removeAttribute(name);
    }
  }

  // Check comment nodes for markers
  if (node.nodeType === Node.COMMENT_NODE) {
    const text = node.textContent;
    if (text.startsWith(MARKER + '-')) {
      const index = parseInt(text.slice(MARKER.length + 1), 10);
      parts[index] = {
        type: 'node',
        path: [...path]
      };
    }
  }

  // Recurse into children
  const children = Array.from(node.childNodes);
  for (let i = 0; i < children.length; i++) {
    walkTemplate(children[i], parts, [...path, i]);
  }
}

/**
 * Check if a value is a TemplateResult
 */
export function isTemplateResult(value) {
  return value && value._type === 'template-result';
}
