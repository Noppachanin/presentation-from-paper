/**
 * Stateful gesture layer for the Input_Router (task 7.4).
 *
 * The pure routing decision lives in `router.ts` and answers the question
 * "given a classified pointer and the current context, what does this pointer
 * mean?". That function is intentionally stateless. Real pointer input,
 * however, arrives as a *timeline* of `pointerdown` / `pointermove` /
 * `pointerup` / `pointercancel` events across several pointers at once, and the
 * higher-level behaviors the design requires are all about that timeline:
 *
 *  - **Palm_Rejection_Window** (Req 13.8): touch is discarded while any pen is
 *    in contact and for 300 ms after the last pen lifts.
 *  - **Pen-cancels-touch** (Req 13.9): a pen landing mid pan/pinch cancels that
 *    touch gesture and freezes the Camera.
 *  - **Pointer capture** (Req 13.12): capture on down, release on up/cancel.
 *  - **pointercancel** (Req 13.13): end the pointer's gesture/stroke but keep
 *    the points gathered so far.
 *  - **Flick detection** (Req 8.12): a one-finger horizontal move of >= 80
 *    screen px within 300 ms is Step navigation, not a pan.
 *  - **Tap-half navigation** (Req 8.2, 8.3, 8.14): in Present_Mode a non-pen tap
 *    in the right/left half of the viewport steps forward/back; pen never does.
 *
 * This module implements that timeline logic as a {@link GestureController}
 * class that owns the mutable per-pointer state and *emits* high-level
 * {@link GestureEvent}s. It never reads the DOM and never reads the wall clock:
 *
 *  - **Injected clock.** Every event-handling method takes an explicit `now`
 *    (a millisecond timestamp). The caller passes `event.timeStamp` (or any
 *    monotonic clock). Threading time in as data — rather than calling
 *    `Date.now()` / `performance.now()` internally — is what lets task 7.7
 *    property-test palm-rejection and pen-cancels-touch over synthetic
 *    timelines.
 *  - **Injected capture target.** Pointer capture is expressed against a small
 *    {@link PointerCaptureTarget} interface (`setPointerCapture` /
 *    `releasePointerCapture`) rather than a real `Element`. In production the
 *    capture surface element satisfies this interface directly; in tests a
 *    recording stub does, so capture/release can be asserted without a DOM.
 *
 * The decision of *what a pointer means* is still delegated to the pure
 * {@link route} — this layer only adds the time/state/capture machinery on top
 * and reinterprets a Present_Mode one-finger `pan` route as tap/flick
 * navigation when the gesture qualifies. The thin
 * `addEventListener`-based DOM wrapper that feeds real `PointerEvent`s into a
 * controller lives in `domGestures.ts`.
 */

import { classify, route, type PointerKind, type Route } from './router';
import type { Tool } from '../types';

/**
 * How long the Palm_Rejection_Window stays open after the last pen lifts, in
 * milliseconds (Req 13.8). Exported so tests and the flick threshold can refer
 * to the same constant rather than a magic number.
 */
export const PALM_REJECTION_HOLD_MS = 300;

/**
 * Minimum horizontal displacement, in screen pixels, for a one-finger move to
 * count as a flick instead of a pan (Req 8.12).
 */
export const FLICK_MIN_DISTANCE_PX = 80;

/**
 * Maximum elapsed time, in milliseconds, within which the
 * {@link FLICK_MIN_DISTANCE_PX} displacement must happen for a move to count as
 * a flick (Req 8.12).
 */
export const FLICK_MAX_DURATION_MS = 300;

/**
 * The minimal, framework-agnostic shape this layer needs from a DOM
 * `PointerEvent`. A real `PointerEvent` is assignable to this type, and tests
 * can build plain object literals. `timeStamp` is optional on the event because
 * every handler also receives an explicit injected `now`; when present it is
 * only used by the DOM wrapper as the value to pass as `now`.
 */
export interface PointerEventLike {
  /** Stable id identifying this pointer across its down → move → up sequence. */
  pointerId: number;
  /** `'pen'`, `'touch'`, `'mouse'`, or any other string (classified leniently). */
  pointerType: string;
  /** X position in screen (CSS) pixels relative to the viewport. */
  clientX: number;
  /** Y position in screen (CSS) pixels relative to the viewport. */
  clientY: number;
  /** Bitmask of buttons held; forwarded to consumers, not used for routing. */
  buttons?: number;
  /** Normalized pen pressure in [0, 1]; forwarded to ink consumers. */
  pressure?: number;
  /** Event timestamp in ms; used by the DOM wrapper as the injected `now`. */
  timeStamp?: number;
}

/**
 * The capture surface abstraction (Req 13.12). A real capture element exposes
 * exactly these two methods, so the production surface can be passed directly;
 * tests pass a stub that records the calls.
 */
export interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

/** The context the controller needs to drive the pure {@link route}. */
export interface GestureContext {
  /** Edit_Mode or Present_Mode. */
  mode: 'edit' | 'present';
  /** The active toolbar / Ink_Palette tool. */
  activeTool: Tool;
  /** Viewport size in screen px; the width splits tap-half navigation. */
  viewport: { width: number; height: number };
}

/**
 * High-level events emitted by the controller. The app shell / stores consume
 * these; this layer only computes and emits the *intent*, it does not mutate
 * any Camera or document state itself.
 *
 * - `begin` / `move` / `end` carry a routed gesture for a single pointer.
 *   `route` is the pure routing outcome at `begin`; `cancelled` on `end`
 *   distinguishes a `pointercancel` (keep collected points) from a normal
 *   `pointerup`.
 * - `nav` is emitted for tap-half and flick navigation in Present_Mode.
 * - `freeze-camera` is emitted when a pen cancels an in-progress touch gesture
 *   (Req 13.9); the actual freeze is applied by the app shell.
 */
export type GestureEvent =
  | {
      type: 'begin';
      pointerId: number;
      kind: PointerKind;
      route: Route;
      x: number;
      y: number;
      pressure: number;
    }
  | {
      type: 'move';
      pointerId: number;
      kind: PointerKind;
      route: Route;
      x: number;
      y: number;
      pressure: number;
    }
  | {
      type: 'end';
      pointerId: number;
      kind: PointerKind;
      route: Route;
      /** True when this ended via `pointercancel` (points are kept). */
      cancelled: boolean;
      /** Points collected over the pointer's lifetime, in draw order. */
      points: { x: number; y: number; pressure: number }[];
    }
  | { type: 'nav'; direction: 'next' | 'prev'; source: 'tap' | 'flick' }
  | { type: 'freeze-camera'; reason: 'pen-cancels-touch' };

/** Per-pointer state tracked while a pointer is in contact. */
interface ActivePointer {
  pointerId: number;
  kind: PointerKind;
  /** The route decided at `pointerdown`; stable for the pointer's lifetime. */
  route: Route;
  /** Screen position and time at `pointerdown` (for flick/tap detection). */
  startX: number;
  startY: number;
  startTime: number;
  /** Latest screen position. */
  lastX: number;
  lastY: number;
  /** Whether this pointer moved past the flick distance at any point. */
  movedBeyondFlick: boolean;
  /** Collected points over the lifetime, kept across pointercancel (Req 13.13). */
  points: { x: number; y: number; pressure: number }[];
  /**
   * True when this is a touch gesture that was discarded at down (palm window)
   * so later move/up/cancel events for it are ignored without emitting.
   */
  discarded: boolean;
}

/**
 * Owns the mutable timeline state for a single capture surface and turns raw
 * pointer events into {@link GestureEvent}s. One instance per input surface.
 *
 * All four handlers (`pointerDown`, `pointerMove`, `pointerUp`,
 * `pointerCancel`) take the triggering event plus an explicit `now` and the
 * current {@link GestureContext}, and return the events to dispatch. The
 * context is passed per-call (not stored) so the controller always routes
 * against the live mode/tool without needing a subscription.
 */
export class GestureController {
  private readonly capture?: PointerCaptureTarget;

  /** Pointers currently in contact, keyed by pointerId. */
  private readonly active = new Map<number, ActivePointer>();

  /** Count of pens currently in contact. Palm window is open while > 0. */
  private pensDown = 0;

  /**
   * Time (injected-clock ms) the last pen lifted. The Palm_Rejection_Window
   * remains open until `now > penUpAt + PALM_REJECTION_HOLD_MS`. `-Infinity`
   * means no pen has lifted yet (window closed on the time axis).
   */
  private lastPenUpAt = Number.NEGATIVE_INFINITY;

  constructor(capture?: PointerCaptureTarget) {
    this.capture = capture;
  }

  /**
   * Number of touch pointers currently in contact that were not discarded.
   * This is the `fingerCount` the pure router needs (Req 13.7).
   */
  private activeFingerCount(): number {
    let n = 0;
    for (const p of this.active.values()) {
      if (p.kind === 'touch' && !p.discarded) n += 1;
    }
    return n;
  }

  /**
   * Whether the Palm_Rejection_Window is open at time `now` (Req 13.8): open
   * while any pen is in contact, and held for {@link PALM_REJECTION_HOLD_MS}
   * after the last pen-up.
   */
  isPalmWindowOpen(now: number): boolean {
    if (this.pensDown > 0) return true;
    return now <= this.lastPenUpAt + PALM_REJECTION_HOLD_MS;
  }

  /** True when a one-finger or two-finger touch gesture is currently active. */
  private hasActiveTouchGesture(): boolean {
    for (const p of this.active.values()) {
      if (p.kind === 'touch' && !p.discarded) return true;
    }
    return false;
  }

  /**
   * Handle a `pointerdown`. Decides the route via the pure {@link route} using
   * the live finger count and palm-window state, captures the pointer, and
   * handles the pen-cancels-touch and palm-rejection cross-cutting rules.
   */
  pointerDown(event: PointerEventLike, now: number, ctx: GestureContext): GestureEvent[] {
    const events: GestureEvent[] = [];
    const kind = classify(event.pointerType);
    const pressure = event.pressure ?? 0;

    // Capture on every down so the drag continues outside the element
    // (Req 13.12). Capture is requested even for a pointer we are about to
    // discard; it is released again on the matching up/cancel.
    this.capture?.setPointerCapture(event.pointerId);

    // Pen landing: a pen in contact cancels any in-progress touch gesture and
    // freezes the Camera (Req 13.9). Do this before counting the pen so the
    // cancel reflects the pre-pen gesture state.
    if (kind === 'pen') {
      if (this.hasActiveTouchGesture()) {
        for (const p of [...this.active.values()]) {
          if (p.kind === 'touch' && !p.discarded) {
            events.push(this.endPointer(p, /* cancelled */ true, now));
          }
        }
        events.push({ type: 'freeze-camera', reason: 'pen-cancels-touch' });
      }
      this.pensDown += 1;
    }

    // Touch during the Palm_Rejection_Window is discarded (Req 13.8). We still
    // track it (so its up/cancel releases capture and keeps the finger count
    // honest) but mark it discarded and emit nothing.
    if (kind === 'touch' && this.isPalmWindowOpen(now)) {
      this.active.set(event.pointerId, {
        pointerId: event.pointerId,
        kind,
        route: { kind: 'discard' },
        startX: event.clientX,
        startY: event.clientY,
        startTime: now,
        lastX: event.clientX,
        lastY: event.clientY,
        movedBeyondFlick: false,
        points: [{ x: event.clientX, y: event.clientY, pressure }],
        discarded: true,
      });
      return events;
    }

    // Route the pointer. fingerCount counts this new touch too, so the second
    // finger of a pinch sees fingerCount === 2 (Req 13.7).
    const fingerCount =
      kind === 'touch' ? this.activeFingerCount() + 1 : this.activeFingerCount();
    const decided = route(kind, {
      mode: ctx.mode,
      activeTool: ctx.activeTool,
      fingerCount,
      palmWindowOpen: this.isPalmWindowOpen(now),
    });

    const pointer: ActivePointer = {
      pointerId: event.pointerId,
      kind,
      route: decided,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      lastX: event.clientX,
      lastY: event.clientY,
      movedBeyondFlick: false,
      points: [{ x: event.clientX, y: event.clientY, pressure }],
      discarded: decided.kind === 'discard',
    };
    this.active.set(event.pointerId, pointer);

    if (!pointer.discarded) {
      events.push({
        type: 'begin',
        pointerId: event.pointerId,
        kind,
        route: decided,
        x: event.clientX,
        y: event.clientY,
        pressure,
      });
    }
    return events;
  }

  /** Handle a `pointermove`: record the point and emit a `move` gesture. */
  pointerMove(event: PointerEventLike, _now: number, _ctx: GestureContext): GestureEvent[] {
    const pointer = this.active.get(event.pointerId);
    if (!pointer || pointer.discarded) return [];

    const pressure = event.pressure ?? 0;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.points.push({ x: event.clientX, y: event.clientY, pressure });

    // Track whether the pointer ever moved beyond the flick distance; a pointer
    // that wandered far is never a tap even if it returns near the start.
    if (Math.abs(event.clientX - pointer.startX) >= FLICK_MIN_DISTANCE_PX) {
      pointer.movedBeyondFlick = true;
    }

    return [
      {
        type: 'move',
        pointerId: event.pointerId,
        kind: pointer.kind,
        route: pointer.route,
        x: event.clientX,
        y: event.clientY,
        pressure,
      },
    ];
  }

  /**
   * Handle a `pointerup`: end the pointer's gesture, release capture, and — for
   * a one-finger Present_Mode touch that qualifies — emit flick or tap-half
   * navigation (Req 8.2, 8.3, 8.12) instead of leaving it a plain pan.
   */
  pointerUp(event: PointerEventLike, now: number, ctx: GestureContext): GestureEvent[] {
    const pointer = this.active.get(event.pointerId);
    if (!pointer) {
      // Unknown pointer (e.g. the down was never seen); still release capture.
      this.capture?.releasePointerCapture(event.pointerId);
      return [];
    }

    // Record the final point before closing out the pointer.
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.points.push({
      x: event.clientX,
      y: event.clientY,
      pressure: event.pressure ?? 0,
    });

    const events: GestureEvent[] = [];
    const discarded = pointer.discarded;

    // Navigation detection runs only for a non-discarded one-finger touch whose
    // route was `pan` (the pure router yields `pan` for a single finger in both
    // modes). Pen is excluded because its route is never `pan` (Req 8.14), and
    // tap-half nav only applies in Present_Mode (Req 8.2, 8.3).
    const nav =
      !discarded && pointer.kind === 'touch' && pointer.route.kind === 'pan' && ctx.mode === 'present'
        ? this.detectNavigation(pointer, now, ctx)
        : null;

    const endEvent = this.endPointer(pointer, /* cancelled */ false, now);
    // Only emit the per-pointer `end` when this was a real gesture (not a
    // discarded palm touch).
    if (!discarded) {
      if (nav) {
        // The move was reinterpreted as navigation, so the pan never "ended" as
        // a pan — emit the nav intent in place of the end.
        events.push(nav);
      } else {
        events.push(endEvent);
      }
    }
    return events;
  }

  /**
   * Handle a `pointercancel` (Req 13.13): end the pointer's gesture but keep the
   * points collected so far (do not discard an in-progress ink stroke's data)
   * and release capture.
   */
  pointerCancel(event: PointerEventLike, now: number, _ctx: GestureContext): GestureEvent[] {
    const pointer = this.active.get(event.pointerId);
    if (!pointer) {
      this.capture?.releasePointerCapture(event.pointerId);
      return [];
    }
    const discarded = pointer.discarded;
    const endEvent = this.endPointer(pointer, /* cancelled */ true, now);
    return discarded ? [] : [endEvent];
  }

  /**
   * Decide whether a finished one-finger Present_Mode pan should instead be a
   * navigation (Req 8.12 flick, Req 8.2/8.3 tap-half). Returns the `nav` event
   * or `null` to leave it a pan.
   *
   * - **Flick:** horizontal displacement >= 80 px within 300 ms. A leftward
   *   flick (end left of start) goes to the next Step; a rightward flick goes
   *   to the previous Step (Req 8.12).
   * - **Tap:** the pointer barely moved (never crossed the flick distance and
   *   total displacement is small). A tap in the right half of the viewport is
   *   next; the left half is previous (Req 8.2, 8.3).
   */
  private detectNavigation(
    pointer: ActivePointer,
    now: number,
    ctx: GestureContext,
  ): Extract<GestureEvent, { type: 'nav' }> | null {
    const dx = pointer.lastX - pointer.startX;
    const dy = pointer.lastY - pointer.startY;
    const elapsed = now - pointer.startTime;

    // Flick: fast enough and far enough horizontally.
    if (Math.abs(dx) >= FLICK_MIN_DISTANCE_PX && elapsed <= FLICK_MAX_DURATION_MS) {
      return { type: 'nav', direction: dx < 0 ? 'next' : 'prev', source: 'flick' };
    }

    // Tap: effectively stationary. A pointer that ever travelled past the flick
    // distance is a drag/pan, not a tap, even if it returned near the start.
    const moved = Math.hypot(dx, dy);
    const TAP_SLOP_PX = 10;
    if (!pointer.movedBeyondFlick && moved <= TAP_SLOP_PX) {
      const half = ctx.viewport.width / 2;
      return {
        type: 'nav',
        direction: pointer.lastX >= half ? 'next' : 'prev',
        source: 'tap',
      };
    }

    // Otherwise it stays a pan.
    return null;
  }

  /**
   * Remove a pointer from the active set, update pen bookkeeping and the palm
   * window, release capture, and build its `end` event. Shared by the normal
   * up path, the pointercancel path, and the pen-cancels-touch path.
   *
   * `now` is the injected-clock time (ms) at which this pointer left contact. A
   * pen leaving contact anchors the Palm_Rejection_Window's 300 ms hold to this
   * time, so `isPalmWindowOpen(t)` returns true until `t > now + 300` after the
   * last pen lifts (Req 13.8). The hold is anchored to the *last* pen-up: each
   * pen-up overwrites `lastPenUpAt`, and because pens only lift later in time,
   * the final pen's timestamp is the one that matters.
   */
  private endPointer(
    pointer: ActivePointer,
    cancelled: boolean,
    now: number,
  ): Extract<GestureEvent, { type: 'end' }> {
    this.active.delete(pointer.pointerId);

    if (pointer.kind === 'pen') {
      this.pensDown = Math.max(0, this.pensDown - 1);
      if (this.pensDown === 0) {
        // The last pen just lifted: start the 300 ms post-pen-up hold anchored
        // to this up/cancel time (Req 13.8).
        this.lastPenUpAt = now;
      }
    }

    this.capture?.releasePointerCapture(pointer.pointerId);

    return {
      type: 'end',
      pointerId: pointer.pointerId,
      kind: pointer.kind,
      route: pointer.route,
      cancelled,
      points: pointer.points,
    };
  }
}
