/**
 * Thin DOM wrapper that feeds real `PointerEvent`s into a {@link GestureController}
 * (task 7.4).
 *
 * The timeline/decision logic lives in `gestureState.ts` and is intentionally
 * DOM-free and clock-free so task 7.7 can property-test it over synthetic
 * Pointer_Event-like inputs. This wrapper is the opposite: it is the only place
 * that touches a real `Element`, the real `addEventListener` API, and the
 * browser clock. It owns no behavior of its own — it translates browser events
 * into controller calls and hands the controller's emitted
 * {@link GestureEvent}s to a sink.
 *
 * Responsibilities (design "Input_Router"):
 *
 *  - Register the four pointer listeners (`pointerdown` / `pointermove` /
 *    `pointerup` / `pointercancel`) on the capture surface and forward each to
 *    the matching controller handler, passing `event.timeStamp` as the injected
 *    `now`.
 *  - Suppress Safari's default touch/gesture handling so the Application
 *    receives raw pointer input: it `preventDefault`s the Safari gesture events
 *    (`gesturestart` / `gesturechange` / `gestureend`), `touchmove`, and
 *    `contextmenu` (Req 13.2, 13.3). `touch-action: none` and the
 *    `user-select` / `-webkit-touch-callout` CSS are applied by the canvas
 *    surface component (task 13.2); this wrapper handles the event-level
 *    suppression.
 *  - The capture element is passed to the controller as its
 *    {@link PointerCaptureTarget}, since a real `Element` already exposes
 *    `setPointerCapture` / `releasePointerCapture` (Req 13.12).
 *
 * The {@link GestureContext} is read lazily through a getter on every event so
 * the wrapper always routes against the live mode/tool/viewport without
 * re-attaching listeners when those change.
 */

import { GestureController } from './gestureState';
import type { GestureContext, GestureEvent } from './gestureState';

/**
 * The subset of `Element` this wrapper needs: the event-target methods plus the
 * pointer-capture methods. A real DOM `Element` satisfies it; tests can pass a
 * stub. Kept structural so this module stays testable without a DOM.
 */
export interface GestureSurface {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

/** Options for {@link attachGestures}. */
export interface AttachGesturesOptions {
  /** The capture surface element (or a structural stand-in). */
  surface: GestureSurface;
  /** Supplies the live routing context on each event. */
  getContext: () => GestureContext;
  /** Receives every {@link GestureEvent} the controller emits. */
  onGesture: (event: GestureEvent) => void;
  /**
   * Optional controller to use. Defaults to a fresh {@link GestureController}
   * whose {@link PointerCaptureTarget} is the surface itself. Injectable so a
   * caller can share or pre-seed a controller.
   */
  controller?: GestureController;
}

/**
 * Attach the pointer listeners and Safari gesture suppression to `surface`, and
 * return a `detach` function that removes them all. Pointer events are routed
 * through the controller; its emitted {@link GestureEvent}s are forwarded to
 * `onGesture` in order.
 */
export function attachGestures(options: AttachGesturesOptions): () => void {
  const { surface, getContext, onGesture } = options;
  const controller = options.controller ?? new GestureController(surface);

  const dispatch = (events: GestureEvent[]): void => {
    for (const event of events) onGesture(event);
  };

  const onDown = (e: Event): void => {
    const pe = e as PointerEvent;
    dispatch(controller.pointerDown(pe, pe.timeStamp, getContext()));
  };
  const onMove = (e: Event): void => {
    const pe = e as PointerEvent;
    dispatch(controller.pointerMove(pe, pe.timeStamp, getContext()));
  };
  const onUp = (e: Event): void => {
    const pe = e as PointerEvent;
    dispatch(controller.pointerUp(pe, pe.timeStamp, getContext()));
  };
  const onCancel = (e: Event): void => {
    const pe = e as PointerEvent;
    dispatch(controller.pointerCancel(pe, pe.timeStamp, getContext()));
  };

  // Safari gesture / default-touch suppression so we receive raw pointer input
  // (Req 13.2, 13.3). These listeners only call preventDefault.
  const suppress = (e: Event): void => {
    e.preventDefault();
  };

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onCancel);

  // `touchmove` must be non-passive for preventDefault to take effect.
  surface.addEventListener('touchmove', suppress, { passive: false });
  surface.addEventListener('gesturestart', suppress);
  surface.addEventListener('gesturechange', suppress);
  surface.addEventListener('gestureend', suppress);
  surface.addEventListener('contextmenu', suppress);

  return (): void => {
    surface.removeEventListener('pointerdown', onDown);
    surface.removeEventListener('pointermove', onMove);
    surface.removeEventListener('pointerup', onUp);
    surface.removeEventListener('pointercancel', onCancel);
    surface.removeEventListener('touchmove', suppress);
    surface.removeEventListener('gesturestart', suppress);
    surface.removeEventListener('gesturechange', suppress);
    surface.removeEventListener('gestureend', suppress);
    surface.removeEventListener('contextmenu', suppress);
  };
}
