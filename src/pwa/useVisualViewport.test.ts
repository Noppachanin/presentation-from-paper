import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVisualViewportSize } from './useVisualViewport';
import { isStandalone } from './standalone';

/**
 * Unit tests for the PWA viewport/standalone helpers (task 16.1, Req 15.8, 8.13).
 *
 * `readVisualViewportSize` prefers `window.visualViewport` and falls back to the
 * layout viewport when it is unavailable; `isStandalone` detects
 * Home_Screen_Mode via the standard display-mode query and the legacy Apple
 * `navigator.standalone` flag so the Fullscreen_Fallback hint can suppress
 * itself when already installed.
 */

afterEach(() => {
  vi.restoreAllMocks();
  // Remove any stubbed visualViewport so tests stay independent.
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
});

describe('readVisualViewportSize', () => {
  it('uses window.visualViewport when present (rounded, min 1)', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 812.4, height: 374.6 },
    });
    expect(readVisualViewportSize()).toEqual({ width: 812, height: 375 });
  });

  it('falls back to window.innerWidth/innerHeight when visualViewport is absent', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(768);
    expect(readVisualViewportSize()).toEqual({ width: 1024, height: 768 });
  });

  it('clamps to a minimum of 1x1', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 0, height: 0 },
    });
    expect(readVisualViewportSize()).toEqual({ width: 1, height: 1 });
  });
});

describe('isStandalone', () => {
  it('is true when the display-mode: standalone media query matches', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('standalone'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    expect(isStandalone()).toBe(true);
  });

  it('is true via the legacy navigator.standalone flag when display-mode does not match', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    const nav = navigator as Navigator & { standalone?: boolean };
    const original = nav.standalone;
    Object.defineProperty(nav, 'standalone', { configurable: true, value: true });
    try {
      expect(isStandalone()).toBe(true);
    } finally {
      Object.defineProperty(nav, 'standalone', {
        configurable: true,
        value: original,
      });
    }
  });

  it('is false when neither signal indicates standalone', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    const nav = navigator as Navigator & { standalone?: boolean };
    const original = nav.standalone;
    Object.defineProperty(nav, 'standalone', { configurable: true, value: false });
    try {
      expect(isStandalone()).toBe(false);
    } finally {
      Object.defineProperty(nav, 'standalone', {
        configurable: true,
        value: original,
      });
    }
  });
});
