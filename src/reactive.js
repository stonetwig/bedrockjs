/**
 * Reactive state management system
 */

// Current watcher being tracked
let currentWatcher = null;

// Set of all active watchers
const watchers = new Set();

// Map of reactive objects to their dependency sets
const dependencyMap = new WeakMap();

/**
 * Create a reactive proxy that triggers updates on change
 * @param {Object} target - Object to make reactive
 * @returns {Proxy} - Reactive proxy
 */
export function reactive(target) {
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  // Already a proxy
  if (target.__isReactive) {
    return target;
  }

  const deps = new Map(); // property -> Set of watchers
  dependencyMap.set(target, deps);

  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop === '__isReactive') return true;
      if (prop === '__target') return obj;

      // Track dependency
      if (currentWatcher) {
        if (!deps.has(prop)) {
          deps.set(prop, new Set());
        }
        deps.get(prop).add(currentWatcher);
        currentWatcher.deps.add(deps.get(prop));
      }

      const value = obj[prop];

      // Recursively make nested objects reactive
      if (typeof value === 'object' && value !== null && !value.__isReactive) {
        obj[prop] = reactive(value);
        return obj[prop];
      }

      return value;
    },

    set(obj, prop, value) {
      const oldValue = obj[prop];

      // Make nested objects reactive
      if (typeof value === 'object' && value !== null) {
        value = reactive(value);
      }

      obj[prop] = value;

      // Trigger watchers if value changed
      if (oldValue !== value && deps.has(prop)) {
        const propDeps = deps.get(prop);
        for (const watcher of propDeps) {
          queueWatcher(watcher);
        }
      }

      return true;
    },

    deleteProperty(obj, prop) {
      if (prop in obj) {
        delete obj[prop];
        if (deps.has(prop)) {
          const propDeps = deps.get(prop);
          for (const watcher of propDeps) {
            queueWatcher(watcher);
          }
        }
      }
      return true;
    }
  });

  return proxy;
}

/**
 * Watch for reactive changes and run callback
 * @param {Function} fn - Function to run and track
 * @param {Object} options - Options
 * @returns {Function} - Stop watching function
 */
export function watch(fn, options = {}) {
  const watcher = {
    fn,
    deps: new Set(),
    active: true,
    immediate: options.immediate !== false
  };

  watchers.add(watcher);

  // Run immediately to collect dependencies
  if (watcher.immediate) {
    runWatcher(watcher);
  }

  // Return cleanup function
  return () => {
    watcher.active = false;
    watchers.delete(watcher);
    cleanupWatcher(watcher);
  };
}

/**
 * Run a watcher and track its dependencies
 */
function runWatcher(watcher) {
  if (!watcher.active) return;

  // Cleanup old dependencies
  cleanupWatcher(watcher);

  // Track new dependencies
  const prevWatcher = currentWatcher;
  currentWatcher = watcher;

  try {
    watcher.fn();
  } finally {
    currentWatcher = prevWatcher;
  }
}

/**
 * Clean up watcher dependencies
 */
function cleanupWatcher(watcher) {
  for (const dep of watcher.deps) {
    dep.delete(watcher);
  }
  watcher.deps.clear();
}

// Batch updates using microtask queue
let pendingWatchers = new Set();
let isPending = false;

/**
 * Queue a watcher to run in the next microtask
 */
function queueWatcher(watcher) {
  if (!watcher.active) return;

  pendingWatchers.add(watcher);

  if (!isPending) {
    isPending = true;
    queueMicrotask(flushWatchers);
  }
}

/**
 * Flush all pending watchers
 */
function flushWatchers() {
  const watchersToRun = [...pendingWatchers];
  pendingWatchers.clear();
  isPending = false;

  for (const watcher of watchersToRun) {
    runWatcher(watcher);
  }
}

/**
 * Create a computed value that caches and auto-updates
 * @param {Function} getter - Getter function
 * @returns {Object} - Object with .value property
 */
export function computed(getter) {
  let cachedValue;
  let dirty = true;

  const watcher = {
    fn: () => {
      dirty = true;
      // Trigger any watchers watching this computed
      if (computedDeps.size > 0) {
        for (const dep of computedDeps) {
          queueWatcher(dep);
        }
      }
    },
    deps: new Set(),
    active: true,
    immediate: false
  };

  watchers.add(watcher);
  const computedDeps = new Set();

  return {
    get value() {
      // Track dependency on this computed
      if (currentWatcher) {
        computedDeps.add(currentWatcher);
      }

      if (dirty) {
        const prevWatcher = currentWatcher;
        currentWatcher = watcher;
        cleanupWatcher(watcher);

        try {
          cachedValue = getter();
        } finally {
          currentWatcher = prevWatcher;
        }

        dirty = false;
      }

      return cachedValue;
    },

    stop() {
      watcher.active = false;
      watchers.delete(watcher);
      cleanupWatcher(watcher);
      computedDeps.clear();
    }
  };
}

/**
 * Create a simple signal (reactive value)
 * @param {any} initialValue - Initial value
 * @returns {[Function, Function]} - [getter, setter]
 */
export function signal(initialValue) {
  const state = reactive({ value: initialValue });

  const get = () => state.value;
  const set = (newValue) => {
    state.value = newValue;
  };

  return [get, set];
}

/**
 * Batch multiple updates into a single flush
 * @param {Function} fn - Function containing updates
 */
export function batch(fn) {
  const prevPending = isPending;
  isPending = true;

  try {
    fn();
  } finally {
    if (!prevPending) {
      isPending = false;
      queueMicrotask(flushWatchers);
    }
  }
}
