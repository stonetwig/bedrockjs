/**
 * Browser-safe runtime helpers shared by the sync client and model layers.
 *
 * Mirrors the same helpers in `./protocol.ts` (which is server-side TS).
 * Keeping a small `.js` twin lets the browser entry stay free of `.ts`
 * imports while the server retains full typings.
 */

export { PROTOCOL_VERSION } from './protocol-version.js';

/**
 * Generate a short, unique operation id. Uses crypto.randomUUID when
 * available, falling back to a timestamp + random suffix.
 * @returns {string}
 */
export function makeOpId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let lastNow = 0;

/** @returns {number} */
export function now() {
  const wallNow = Date.now();
  lastNow = Math.max(wallNow, lastNow + 1);
  return lastNow;
}
