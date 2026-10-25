/**
 * The requestAnimationFrame Camera transition loop (task 15.1, Req 7.5-7.8).
 *
 * The camera service (`src/camera`) provides the pure transition math:
 * {@link startTransition} builds a {@link CameraTransition} from a `from`/`to`
 * pair, {@link sampleTransition} samples it at a wall-clock time, and
 * {@link instantTransition} is the reduce-motion snap-to-target path. This hook
 * owns the only piece those pure helpers deliberately leave out: the rAF loop
 * and the wall clock (camera.ts header, task 15.1).
 *
 * Each frame it samples the running transition and writes the result to the
 * Session store via `setCamera`, so every layer (Pages, Items, Overlay, Ink)
 * follows the one shared live Camera in a single frame (Req 7.5). The loop
 * stops when the transition completes, snapping to the exact target (Req 7.8).
 *
 * ## Interrupting (Req 7.6)
 * `animateTo(target)` while a transition is still running starts a NEW
 * transition from the *current* interpolated Camera (the live store Camera),
 * not the old target — exactly what `startTransition`'s `from` contract wants.
 *
 * ## Reduce-motion (Req 7.7, 14.25)
 * When `reduceMotion` is set (the Session flag or the OS
 * `prefers-reduced-motion` media query) `animateTo` skips the animation and
 * sets the target Camera instantly via {@link instantTransition}.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  instantTransition,
  sampleTransition,
  startTransition,
  type CameraTransition,
} from '../camera';
import { useSessionStore } from '../state';
import type { Camera, Viewport } from '../types';

/** A monotonic millisecond clock, falling back to Date.now in odd environments. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** What {@link useCameraTransitions} returns. */
export interface CameraTransitions {
  /**
   * Animate the live Camera to `target`. Interrupts any running transition by
   * starting a fresh one from the current Camera (Req 7.6). When reduce-motion
   * is active the Camera is set instantly (Req 7.7).
   */
  animateTo: (target: Camera) => void;
  /** Snap the live Camera to `target` immediately, cancelling any animation. */
  setInstant: (target: Camera) => void;
  /** Cancel a running transition (leaves the Camera where it is). */
  cancel: () => void;
}

/**
 * Drive animated Camera transitions on requestAnimationFrame.
 *
 * @param getViewport Returns the current viewport (read lazily so a resize is
 *   always reflected without re-creating the callbacks).
 * @param reduceMotion Whether to skip animations and snap instantly (Req 7.7).
 */
export function useCameraTransitions(
  getViewport: () => Viewport,
  reduceMotion: boolean,
): CameraTransitions {
  const transitionRef = useRef<CameraTransition | null>(null);
  const rafRef = useRef<number | null>(null);
  // Keep the latest reduce-motion flag in a ref so the stable callbacks below
  // always read the current value.
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const transition = transitionRef.current;
    if (!transition) {
      rafRef.current = null;
      return;
    }
    const { camera, done } = sampleTransition(transition, nowMs());
    useSessionStore.getState().setCamera(camera);
    if (done) {
      transitionRef.current = null;
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const setInstant = useCallback(
    (target: Camera) => {
      stopLoop();
      transitionRef.current = null;
      useSessionStore.getState().setCamera(instantTransition(target));
    },
    [stopLoop],
  );

  const animateTo = useCallback(
    (target: Camera) => {
      if (reduceMotionRef.current) {
        setInstant(target);
        return;
      }
      // Start from the live Camera so interrupting a running transition picks
      // up from where the eye currently is (Req 7.6).
      const from = useSessionStore.getState().camera;
      transitionRef.current = startTransition(from, target, getViewport(), nowMs());
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [getViewport, setInstant, tick],
  );

  const cancel = useCallback(() => {
    stopLoop();
    transitionRef.current = null;
  }, [stopLoop]);

  // Tear down any pending frame on unmount.
  useEffect(() => stopLoop, [stopLoop]);

  return { animateTo, setInstant, cancel };
}
