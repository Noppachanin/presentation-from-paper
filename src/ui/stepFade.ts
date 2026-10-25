/**
 * Present_Mode step-indicator fade logic (task 14.2, Req 8.10).
 *
 * Req 8.10 requires the current-Step indicator to "fade out after 2 seconds
 * without user input", reappearing when input resumes. The fade *logic* lives
 * here (per the task), while the global input wiring that signals activity is
 * task 15.1.
 *
 * The behaviour is modelled as a small testable hook, {@link useFadeAfter}: it
 * returns whether the element is currently visible plus a `poke()` function the
 * owner calls on every user interaction. Each `poke()` makes the element
 * visible and (re)arms a timer that hides it after the delay; calling `poke()`
 * again before the timer fires resets it — so continuous input keeps the
 * indicator up, and 2 s of silence fades it out.
 *
 * The delay is injectable (default {@link STEP_INDICATOR_FADE_MS}) so tests can
 * drive it with fake timers, and `startVisible` lets the indicator show
 * immediately when Present_Mode is entered.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** The 2-second idle delay before the Step indicator fades (Req 8.10). */
export const STEP_INDICATOR_FADE_MS = 2000;

/** What {@link useFadeAfter} returns. */
export interface FadeController {
  /** True while the element should be shown; false once it has faded out. */
  readonly visible: boolean;
  /**
   * Signal user activity: show the element and (re)start the idle timer. Call
   * on every relevant interaction (task 15.1 wires the global input to this).
   */
  readonly poke: () => void;
}

/**
 * Visibility controller that hides after `delayMs` of inactivity and reappears
 * whenever {@link FadeController.poke} is called (Req 8.10).
 *
 * @param delayMs idle delay before hiding (default {@link STEP_INDICATOR_FADE_MS}).
 * @param startVisible whether to show immediately and arm the timer on mount
 *   (default `true`, matching entering Present_Mode).
 */
export function useFadeAfter(
  delayMs: number = STEP_INDICATOR_FADE_MS,
  startVisible = true,
): FadeController {
  const [visible, setVisible] = useState(startVisible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    clear();
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, delayMs);
  }, [clear, delayMs]);

  const poke = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  // Arm the initial fade when the indicator starts visible (Present_Mode entry).
  useEffect(() => {
    if (startVisible) {
      arm();
    }
    return clear;
    // Run once on mount; `poke` drives every later re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visible, poke };
}
