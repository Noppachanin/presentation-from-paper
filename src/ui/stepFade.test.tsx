import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { STEP_INDICATOR_FADE_MS, useFadeAfter, type FadeController } from './stepFade';

/**
 * Tests for the step-indicator fade logic (Req 8.10): the indicator starts
 * visible, fades out after the idle delay (default 2000 ms), and reappears when
 * `poke()` signals user input, with each poke resetting the idle timer.
 *
 * The hook is driven through a tiny host component rendered with react-dom so
 * the timer/effect behaviour runs exactly as in the app, under fake timers.
 */

// React 18 act() environment flag.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let latest: FadeController;

function Host({ delayMs }: { delayMs?: number }) {
  latest = useFadeAfter(delayMs);
  return createElement('span', null, latest.visible ? 'on' : 'off');
}

function render(delayMs?: number) {
  act(() => {
    root.render(createElement(Host, { delayMs }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe('useFadeAfter (Req 8.10)', () => {
  it('starts visible and uses a 2 second default delay', () => {
    expect(STEP_INDICATOR_FADE_MS).toBe(2000);
    render();
    expect(latest.visible).toBe(true);
  });

  it('fades out after the idle delay with no input', () => {
    render(2000);
    expect(latest.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(latest.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latest.visible).toBe(false);
  });

  it('reappears on poke and resets the idle timer', () => {
    render(2000);

    // Let it fade out.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(latest.visible).toBe(false);

    // Input brings it back.
    act(() => {
      latest.poke();
    });
    expect(latest.visible).toBe(true);

    // A second poke before the timer fires resets the countdown.
    act(() => {
      vi.advanceTimersByTime(1500);
      latest.poke();
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    // Still visible: the second poke reset the 2 s window.
    expect(latest.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(latest.visible).toBe(false);
  });
});
