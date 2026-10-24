/**
 * Input module barrel. Import the Input_Router pure decision API from
 * `src/input` rather than from individual files so the module layout can change
 * without touching call sites. Stateful gesture machinery (palm-rejection
 * clock, pointer capture, flick/tap detection) lands in task 7.4.
 */

export type { PointerKind, Route, RouterContext } from './router';
export { classify, route } from './router';

// Stateful gesture layer (task 7.4): palm-rejection clock, pen-cancels-touch,
// pointer capture, pointercancel handling, and flick/tap navigation detection.
export type {
  PointerEventLike,
  PointerCaptureTarget,
  GestureContext,
  GestureEvent,
} from './gestureState';
export {
  GestureController,
  PALM_REJECTION_HOLD_MS,
  FLICK_MIN_DISTANCE_PX,
  FLICK_MAX_DURATION_MS,
} from './gestureState';

export type { GestureSurface, AttachGesturesOptions } from './domGestures';
export { attachGestures } from './domGestures';
