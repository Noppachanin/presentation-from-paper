/**
 * Fullscreen control helper (task 14.2, Req 8.9).
 *
 * The control in the Ink_Palette must request browser fullscreen "through the
 * standard Fullscreen API or through the WebKit-prefixed Fullscreen API,
 * whichever the browser provides" (Req 8.9). This module isolates that
 * feature-detection so the button stays presentational and so the logic is
 * unit-testable without a real browser.
 *
 * The Fullscreen_Fallback (Req 8.13) — showing the add-to-Home-Screen hint when
 * the API is unavailable or the request is rejected — is task 16. Here we only
 * detect availability and issue the request, returning whether it was issued so
 * the caller (task 15.1 / 16) can decide to fall back.
 */

/**
 * An element that may expose the standard or a WebKit-prefixed
 * `requestFullscreen`. Typed loosely because the prefixed member is not in the
 * standard DOM lib.
 */
type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** True when the given element (or the document) can enter fullscreen. */
export function canRequestFullscreen(
  element: HTMLElement | null = typeof document === 'undefined'
    ? null
    : document.documentElement,
): boolean {
  if (element === null) {
    return false;
  }
  const el = element as FullscreenCapableElement;
  return (
    typeof el.requestFullscreen === 'function' ||
    typeof el.webkitRequestFullscreen === 'function'
  );
}

/**
 * Request fullscreen for `element` using whichever API the browser provides,
 * preferring the standard one. Returns a promise that resolves `true` when a
 * request was issued (standard or prefixed) and `false` when neither API
 * exists. A rejected request resolves `false` so the caller can activate the
 * Fullscreen_Fallback (Req 8.13, wired in task 16).
 *
 * Defaults to the document element so a plain `requestFullscreen()` call puts
 * the whole Application viewport into fullscreen.
 */
export async function requestFullscreen(
  element: HTMLElement | null = typeof document === 'undefined'
    ? null
    : document.documentElement,
): Promise<boolean> {
  if (element === null) {
    return false;
  }
  const el = element as FullscreenCapableElement;
  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
      return true;
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // A rejected request (e.g. not triggered by a user gesture) falls through
    // to the fallback path handled by the caller.
    return false;
  }
  return false;
}
