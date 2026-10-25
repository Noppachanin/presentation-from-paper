/**
 * Home_Screen_Mode (standalone) detection (task 16.1, Req 8.13).
 *
 * The Fullscreen_Fallback hint — "add the app to your Home Screen for a
 * full-screen presentation" — must be suppressed once the app is already
 * installed and running standalone, because it is already full-screen then.
 *
 * Two independent signals detect standalone mode, covering both the modern
 * manifest-driven path and the legacy iOS/iPadOS Safari path:
 *
 *  - `window.matchMedia('(display-mode: standalone)')` — the standard signal,
 *    true for apps launched from a manifest with `display: standalone`.
 *  - `navigator.standalone === true` — the legacy, non-standard Apple property
 *    set when a page is launched from an iOS/iPadOS Home Screen icon. It is not
 *    part of the standard `Navigator` type, so it is read defensively.
 *
 * Either signal being true means the app is in Home_Screen_Mode.
 */

/** A `Navigator` that may expose the legacy Apple `standalone` flag. */
type AppleNavigator = Navigator & { standalone?: boolean };

/**
 * True when the app is running in Home_Screen_Mode (installed / standalone).
 * Safe to call outside a browser (returns `false`).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Modern, standard signal.
  if (typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
      }
    } catch {
      // Some engines throw on malformed queries; ignore and try the legacy path.
    }
  }

  // Legacy iOS/iPadOS Safari signal.
  const nav =
    typeof navigator === 'undefined' ? undefined : (navigator as AppleNavigator);
  return nav?.standalone === true;
}
