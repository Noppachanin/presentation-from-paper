/**
 * Small id-generation helper for items, Steps, and Connectors.
 *
 * Every Focus_Area, white-space item, Step, and Connector needs a stable unique
 * id. Browsers (and modern Node) expose `crypto.randomUUID()`; this helper uses
 * it when available and falls back to a timestamp + random suffix so the pure
 * item operations stay usable in any environment (e.g. a bare unit-test runner
 * without a `crypto` global).
 */

/**
 * Generate a unique id. Prefers `crypto.randomUUID()`; falls back to a
 * timestamp-plus-random string when the Web Crypto API is unavailable.
 */
export function newId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: good enough for uniqueness within a session.
  const rand = Math.random().toString(36).slice(2);
  const rand2 = Math.random().toString(36).slice(2);
  return `id-${Date.now().toString(36)}-${rand}${rand2}`;
}
