# input/

Input_Router, gesture state machines, palm-rejection clock.

Implemented in tasks 7.1, 7.4.

## Modules

- `router.ts` (task 7.1) — the **pure** decision core. `classify(pointerType)`
  maps a `PointerEvent.pointerType` to a `PointerKind`; `route(kind, ctx)` is
  the deterministic routing table over `(mode, activeTool, fingerCount,
  palmWindowOpen)`. No DOM, no timers, no state.

- `gestureState.ts` (task 7.4) — the **stateful** timeline layer built on top of
  `route()`. The `GestureController` class tracks the active pointers and emits
  high-level `GestureEvent`s:
  - **Palm_Rejection_Window** (Req 13.8): open while any pen is in contact, held
    300 ms after the last pen-up. Touch downs during the window are discarded.
  - **Pen-cancels-touch** (Req 13.9): a pen down during an in-progress touch
    gesture cancels that gesture and emits `freeze-camera`.
  - **Pointer capture** (Req 13.12): `setPointerCapture` on down,
    `releasePointerCapture` on up/cancel, via an injected `PointerCaptureTarget`
    abstraction so it is unit-testable without a real DOM element.
  - **pointercancel** (Req 13.13): ends the pointer's gesture/stroke but keeps
    the points collected so far.
  - **Flick** (Req 8.12): a one-finger horizontal move ≥ 80 screen px within
    300 ms becomes `nav` (left → next, right → previous) instead of a pan.
  - **Tap-half nav** (Req 8.2, 8.3, 8.14): in Present_Mode a non-pen tap in the
    right/left half of the viewport becomes `nav`; pen never triggers it.

  Time is injected: every handler takes an explicit `now` (ms); nothing reads
  `Date.now()` / `performance.now()`. This is what lets task 7.7 property-test
  palm-rejection and pen-cancels-touch over synthetic timelines.

- `domGestures.ts` (task 7.4) — the thin, DOM-only wrapper. `attachGestures`
  registers the four pointer listeners on the capture surface (forwarding
  `event.timeStamp` as `now`), suppresses the Safari gesture events / `touchmove`
  / `contextmenu` (Req 13.2, 13.3), uses the surface element as the pointer
  capture target, and returns a `detach` cleanup. It owns no gesture logic.

Import everything through the `src/input` barrel rather than individual files.
