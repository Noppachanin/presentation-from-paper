/**
 * A tiny trailing-edge debounce used by the PDF_Loader to re-render visible
 * pages only after the Camera zoom has *settled* (Req 1.6: re-render within
 * 500 ms after the zoom change ends). The actual wiring to Camera events lives
 * in tasks 13/15; this helper only provides the "fire once the bursts stop"
 * timing primitive so the loader exposes a clean re-render trigger.
 *
 * The clock is injectable (`setTimer`/`clearTimer`) so the behavior is testable
 * without real timers; it defaults to the global `setTimeout`/`clearTimeout`.
 */

/** A debounced function plus a `cancel` to drop any pending trailing call. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Cancel a pending trailing invocation, if any. */
  cancel(): void;
}

/** Injectable timer functions (defaults to the global timers). */
export interface TimerFns {
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

const defaultTimers: TimerFns = {
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Wrap `fn` so that it runs only after `delayMs` has elapsed with no further
 * calls — the trailing edge of a burst. Each call restarts the timer, so a
 * continuous stream of zoom changes defers the re-render until the stream stops
 * (Req 1.6). The most recent call's arguments win.
 *
 * @param fn      The function to run once the burst settles.
 * @param delayMs Quiet period before firing (design default 500 for zoom).
 * @param timers  Injectable timer functions (defaults to global timers).
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
  timers: TimerFns = defaultTimers,
): Debounced<A> {
  let handle: unknown = null;

  const debounced = ((...args: A) => {
    if (handle !== null) {
      timers.clearTimer(handle);
    }
    handle = timers.setTimer(() => {
      handle = null;
      fn(...args);
    }, delayMs);
  }) as Debounced<A>;

  debounced.cancel = () => {
    if (handle !== null) {
      timers.clearTimer(handle);
      handle = null;
    }
  };

  return debounced;
}

/** The design's zoom-settle quiet period in milliseconds (Req 1.6). */
export const ZOOM_SETTLE_MS = 500;
