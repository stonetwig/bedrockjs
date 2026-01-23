/**
 * DOM rendering and patching engine
 */

import { isTemplateResult } from './html.js';

// Store instance state keyed by container
const instanceMap = new WeakMap();

// Unique key for tracking array items
const KEY_SYMBOL = Symbol('bedrock-key');

/**
 * Render a template result into a container
 * @param {TemplateResult} result - The template to render
 * @param {Element} container - The container element
 */
export function render(result, container) {
  let instance = instanceMap.get(container);

  if (!instance) {
    // First render - create new instance
    instance = createInstance(result, container);
    instanceMap.set(container, instance);
  } else if (instance.strings === result.strings) {
    // Same template - update values only
    updateInstance(instance, result.values);
  } else {
    // Different template - replace entirely
    container.innerHTML = '';
    instance = createInstance(result, container);
    instanceMap.set(container, instance);
  }
}

/**
 * Create a new template instance
 */
function createInstance(result, container) {
  const template = result.getTemplate();
  const fragment = template.element.content.cloneNode(true);

  // Resolve node paths to actual nodes in the fragment
  const parts = template.parts.map((part) => {
    if (!part) return null;
    const node = getNodeByPath(fragment, part.path);
    return { ...part, node, value: undefined };
  });

  // Apply initial values before adding to DOM
  for (let i = 0; i < result.values.length; i++) {
    if (parts[i]) {
      applyValue(parts[i], result.values[i]);
    }
  }

  container.appendChild(fragment);

  return {
    strings: result.strings,
    parts,
    container
  };
}

/**
 * Update an existing instance with new values
 */
function updateInstance(instance, values) {
  for (let i = 0; i < values.length; i++) {
    const part = instance.parts[i];
    if (part && part.value !== values[i]) {
      applyValue(part, values[i]);
    }
  }
}

/**
 * Apply a value to a part
 */
function applyValue(part, value) {
  const oldValue = part.value;
  part.value = value;

  switch (part.type) {
    case 'attribute':
      applyAttribute(part.node, part.name, value);
      break;
    case 'property':
      part.node[part.name] = value;
      break;
    case 'event':
      applyEvent(part, value, oldValue);
      break;
    case 'node':
      applyNode(part, value, oldValue);
      break;
  }
}

/**
 * Apply an attribute value
 */
function applyAttribute(node, name, value) {
  if (value === null || value === undefined || value === false) {
    node.removeAttribute(name);
  } else if (value === true) {
    node.setAttribute(name, '');
  } else {
    node.setAttribute(name, String(value));
  }
}

/**
 * Apply an event handler
 */
function applyEvent(part, value, oldValue) {
  if (oldValue) {
    part.node.removeEventListener(part.name, oldValue);
  }
  if (value) {
    part.node.addEventListener(part.name, value);
  }
}

/**
 * Apply a node value (text, template, or array)
 */
function applyNode(part, value, oldValue) {
  const node = part.node;

  if (value === null || value === undefined) {
    clearNodePart(part);
  } else if (isTemplateResult(value)) {
    applyTemplateNode(part, value);
  } else if (Array.isArray(value)) {
    applyArrayNode(part, value);
  } else {
    // Primitive value - render as text
    clearNodePart(part);
    const textNode = document.createTextNode(String(value));
    node.parentNode.insertBefore(textNode, node);
    part.nodes = [textNode];
  }
}

/**
 * Clear any rendered content for a node part
 */
function clearNodePart(part) {
  if (part.nodes) {
    part.nodes.forEach(n => n.remove());
    part.nodes = null;
  }
  if (part.templateInstance) {
    part.templateInstance = null;
  }
  if (part.arrayItems) {
    part.arrayItems.forEach(item => item.nodes.forEach(n => n.remove()));
    part.arrayItems = null;
  }
}

/**
 * Apply a template result to a node part
 */
function applyTemplateNode(part, value) {
  const marker = part.node;

  // Check if we have an existing template instance with same structure
  if (part.templateInstance && part.templateInstance.strings === value.strings) {
    // Update existing template
    updateInstance(part.templateInstance, value.values);
    return;
  }

  // Clear any existing content
  clearNodePart(part);

  // Create new template instance
  const template = value.getTemplate();
  const fragment = template.element.content.cloneNode(true);

  const parts = template.parts.map((p) => {
    if (!p) return null;
    const n = getNodeByPath(fragment, p.path);
    return { ...p, node: n, value: undefined };
  });

  // Apply values
  for (let i = 0; i < value.values.length; i++) {
    if (parts[i]) {
      applyValue(parts[i], value.values[i]);
    }
  }

  // Track nodes being inserted
  const nodes = Array.from(fragment.childNodes);
  marker.parentNode.insertBefore(fragment, marker);

  part.nodes = nodes;
  part.templateInstance = { strings: value.strings, parts };
}

/**
 * Apply an array of values/templates to a node part
 */
function applyArrayNode(part, values) {
  const marker = part.node;
  const parent = marker.parentNode;
  const oldItems = part.arrayItems || [];

  // Build map of old items by key
  const oldItemsByKey = new Map();
  for (const item of oldItems) {
    if (item.key !== undefined) {
      oldItemsByKey.set(item.key, item);
    }
  }

  const newItems = [];

  // Process each new value
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const key = value && value[KEY_SYMBOL] !== undefined ? value[KEY_SYMBOL] : i;

    let item = oldItemsByKey.get(key);

    if (item) {
      // Reuse existing item
      oldItemsByKey.delete(key);
      if (isTemplateResult(value)) {
        if (item.instance && item.instance.strings === value.strings) {
          updateInstance(item.instance, value.values);
        } else {
          // Different template - recreate
          item.nodes.forEach(n => n.remove());
          item = createArrayItem(value, key, marker, parent);
        }
      } else {
        // Update text content
        if (item.nodes[0]) {
          item.nodes[0].textContent = String(value ?? '');
        }
      }
    } else {
      // Create new item
      item = createArrayItem(value, key, marker, parent);
    }

    newItems.push(item);
  }

  // Remove old items that are no longer present
  for (const item of oldItemsByKey.values()) {
    item.nodes.forEach(n => n.remove());
  }

  // Reorder items to be before the marker
  for (const item of newItems) {
    for (const itemNode of item.nodes) {
      parent.insertBefore(itemNode, marker);
    }
  }

  part.arrayItems = newItems;
}

/**
 * Create a new array item
 */
function createArrayItem(value, key, marker, parent) {
  if (isTemplateResult(value)) {
    const template = value.getTemplate();
    const fragment = template.element.content.cloneNode(true);

    const parts = template.parts.map((p) => {
      if (!p) return null;
      const n = getNodeByPath(fragment, p.path);
      return { ...p, node: n, value: undefined };
    });

    for (let i = 0; i < value.values.length; i++) {
      if (parts[i]) {
        applyValue(parts[i], value.values[i]);
      }
    }

    const nodes = Array.from(fragment.childNodes);
    parent.insertBefore(fragment, marker);

    return {
      key,
      nodes,
      instance: { strings: value.strings, parts }
    };
  } else {
    const textNode = document.createTextNode(String(value ?? ''));
    parent.insertBefore(textNode, marker);
    return { key, nodes: [textNode], instance: null };
  }
}

/**
 * Get a node by path from a root
 */
function getNodeByPath(root, path) {
  let node = root;
  for (const index of path) {
    if (!node.childNodes) return null;
    node = node.childNodes[index];
    if (!node) return null;
  }
  return node;
}

/**
 * Create a keyed item for array rendering
 * @param {any} key - Unique key for this item
 * @param {TemplateResult} template - The template result
 */
export function keyed(key, template) {
  template[KEY_SYMBOL] = key;
  return template;
}
