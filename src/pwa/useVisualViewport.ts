/**
 * Visual-viewport sizing hook (task 16.1, Req 15.8).
 *
 * In Present_Mode the Canvas must be sized to the *visible* viewport so the
 * collapsing Safari toolbar and address bar never cover the Canvas or the
 * Ink_Palette (Req 15.8). The layout viewport (`window.innerWidth/Height`)
 * does not shrink when the Safari chrome is shown, but `window.visualViewport`
 * reports the actually-visible region and fires `resize`/`scroll` as the
 * chrome collapses or expands.
 *
 * This hook returns the current visual-viewport size, subscribing to the
 * `visualViewport` `resize`/`scroll` events, and falls back to
 * `window.innerWidth/innerHeight` when `visualViewport` is unavailable (older
 * engines, non-browser/test environments). The returned size is clamped to a
 * minimum of 1×1 so consumers never divide by zero.
 */

import { useEffect, useState } from 'react';

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Read the current visual-viewport size, preferring `window.visualViewport`
 * and falling back to the layout viewport. Pure and safe to call in SSR/tests
 * (returns 1×1 when `window` is absent).
 */
export function readVisualViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1, height: 1 };
  }
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/**
 * React hook returning the current visual-viewport size and keeping it in sync
 * with `visualViewport` `resize`/`scroll` events (and a `window` `resize`
 * fallback when `visualViewport` is unavailable).
 */
export function useVisualViewport(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(() => readVisualViewportSize());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => setSize(readVisualViewportSize());
    // Sync once on mount in case the viewport changed between the initial
    // render and the effect running.
    update();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    // Fallback: no visualViewport — track the layout viewport instead.
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}
