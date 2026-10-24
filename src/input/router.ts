/**
 * Input_Router — pure pointer classification and routing decision.
 *
 * This module owns the two *pure* parts of the Input_Router (design
 * "Input_Router (validated by the spike)"):
 *
 *  1. `classify(pointerType)` maps a DOM `PointerEvent.pointerType` string to a
 *     {@link PointerKind} (Req 13.1).
 *  2. `route(kind, ctx)` is the deterministic decision table that turns a
 *     classified pointer plus the current mode/tool/gesture context into a
 *     {@link Route} (Req 13.4, 13.5, 13.6, 13.7, 13.10, 13.11).
 *
 * Neither function reads the DOM, touches timers, or holds state. Keeping the
 * decision pure is what lets the routing table be driven by synthetic
 * Pointer_Events in unit/property tests (Req 12.9, design Properties 26/27).
 *
 * Out of scope for this module (handled by the stateful Input_Router in task
 * 7.4): palm-rejection timing, pointer capture, pointercancel handling,
 * pen-cancels-touch, and flick/tap navigation detection. The caller is
 * responsible for computing `fingerCount` and `palmWindowOpen` and for turning
 * a `pan` route in Present_Mode into tap/flick navigation when appropriate.
 */

import type { Tool } from '../types';

/**
 * The three input kinds the router distinguishes, derived strictly from the
 * `pointerType` of a Pointer_Event (Req 13.1).
 */
export type PointerKind = 'pen' | 'touch' | 'mouse';

/**
 * The outcome of a routing decision.
 *
 * `route()` in this task produces `ink-draw`, `ink-erase`, `edit`, `pan`,
 * `pinch`, and `discard`. The `nav-next`/`nav-prev` variants are part of the
 * type so the gesture layer in task 7.4 can emit them from tap/flick detection
 * on top of a `pan` route in Present_Mode; `route()` itself never returns them.
 */
export type Route =
  | { kind: 'ink-draw' }
  | { kind: 'ink-erase' }
  | { kind: 'edit' }
  | { kind: 'pan' }
  | { kind: 'pinch' }
  | { kind: 'nav-next' }
  | { kind: 'nav-prev' }
  | { kind: 'discard' };

/**
 * The context a routing decision depends on. Exactly the five inputs the design
 * names: `(mode, activeTool, pointerType, fingerCount, palmWindowOpen)` — the
 * `pointerType` arrives as the already-classified {@link PointerKind} argument
 * to {@link route}.
 */
export interface RouterContext {
  /** Whether the application is in Edit_Mode or Present_Mode. */
  mode: 'edit' | 'present';
  /** The currently active toolbar / Ink_Palette tool. */
  activeTool: Tool;
  /**
   * Number of Touch_Input pointers currently in contact. Only meaningful for
   * `touch` routing; ignored for `pen` and `mouse`.
   */
  fingerCount: number;
  /**
   * Whether the Palm_Rejection_Window is open (a pen is in contact or was
   * within the last 300 ms). Computed by the stateful router (task 7.4) using
   * an injected clock; passed in here so the decision stays pure (Req 13.8).
   */
  palmWindowOpen: boolean;
}

/**
 * Classify a DOM `PointerEvent.pointerType` into a {@link PointerKind}
 * (Req 13.1).
 *
 * Safari reports `'pen'` for the Apple Pencil, `'touch'` for a finger, and
 * `'mouse'` for a mouse (confirmed by the `pointer-events-demo.html` spike).
 *
 * Default for unknown/empty values: `'mouse'`. The Pointer Events spec allows a
 * user agent to report an empty string or a vendor-specific value when it
 * cannot determine the device. Treating those as `'mouse'` falls back to the
 * most conservative behavior — the same path a desktop pointer takes — rather
 * than accidentally enabling pen-only ink drawing or touch gestures for a
 * device we do not recognize.
 */
export function classify(pointerType: string): PointerKind {
  switch (pointerType) {
    case 'pen':
      return 'pen';
    case 'touch':
      return 'touch';
    case 'mouse':
      return 'mouse';
    default:
      return 'mouse';
  }
}

/** True when the active tool is the Ink_Tool. */
function isInkTool(tool: Tool): boolean {
  return tool === 'ink';
}

/** True when the active tool is the Eraser_Tool. */
function isEraserTool(tool: Tool): boolean {
  return tool === 'eraser';
}

/**
 * The pure routing decision (design "Input_Router" table).
 *
 * Precedence is deterministic and exhaustive: every `(kind, ctx)` combination
 * resolves to exactly one {@link Route}. Choices worth calling out:
 *
 * - **Pen eraser beats pen ink.** When the Eraser_Tool is active, pen contact
 *   erases (`ink-erase`) even though the Ink_Tool-or-Present_Mode draw rule
 *   also mentions pens. Checking eraser first keeps the two ink routes from
 *   overlapping (Req 13.5 vs 14.14/14.16).
 * - **Present_Mode makes the pen draw without any ink tool.** A pen always
 *   draws in Present_Mode and never steps the Sequence, so Pencil marks during
 *   a talk never advance slides (Req 13.5, 13.10, 8.14).
 * - **Palm window beats every touch route.** While the Palm_Rejection_Window is
 *   open, touch is discarded regardless of finger count or tool, so a resting
 *   palm cannot pan or pinch while the pen draws (Req 13.8).
 * - **Two-finger touch beats one-finger rules.** Finger count is checked before
 *   the mode/tool single-finger rules so a second finger always means pinch
 *   (Req 13.7).
 * - **One-finger touch always pans here.** In Edit_Mode (with or without an ink
 *   tool) and in Present_Mode a single finger pans. In Present_Mode the gesture
 *   layer (task 7.4) may reinterpret that pan as tap/flick navigation; this
 *   pure function stops at `pan` (Req 2.1, 13.4, 13.6; 8.2/8.3/8.12 deferred).
 * - **Mouse mirrors the pen's edit/ink behavior.** The primary mouse button
 *   draws/erases when an ink/eraser tool is active and otherwise behaves as the
 *   existing edit pointer, unchanged across Edit_Mode and Present_Mode
 *   (Req 13.5, 13.11, 14.14).
 */
export function route(kind: PointerKind, ctx: RouterContext): Route {
  switch (kind) {
    case 'pen':
      return routePen(ctx);
    case 'touch':
      return routeTouch(ctx);
    case 'mouse':
      return routeMouse(ctx);
  }
}

function routePen(ctx: RouterContext): Route {
  // Eraser first so pen+eraser never overlaps the draw rule (Req 14.14/14.16).
  if (isEraserTool(ctx.activeTool)) {
    return { kind: 'ink-erase' };
  }
  // Pen draws when the Ink_Tool is active or whenever in Present_Mode, and this
  // never advances a Step (Req 13.5, 13.10, 8.14).
  if (isInkTool(ctx.activeTool) || ctx.mode === 'present') {
    return { kind: 'ink-draw' };
  }
  // Edit_Mode, no ink/eraser tool: the pen acts like the primary mouse button
  // for focus/note/crop/connector/select/move/resize (Req 13.4).
  return { kind: 'edit' };
}

function routeTouch(ctx: RouterContext): Route {
  // A resting palm (or any touch during the rejection window) is dropped before
  // any gesture is considered (Req 13.8).
  if (ctx.palmWindowOpen) {
    return { kind: 'discard' };
  }
  // Two or more fingers pinch-zoom/pan around the midpoint (Req 2.2, 13.7).
  if (ctx.fingerCount >= 2) {
    return { kind: 'pinch' };
  }
  // A single finger always pans: in Edit_Mode with no ink tool (Req 2.1, 13.4),
  // while an ink/eraser tool is active so the finger still moves the Camera
  // while the pen draws (Req 13.6), and in Present_Mode (where task 7.4 may
  // later reinterpret the pan as tap/flick navigation).
  return { kind: 'pan' };
}

function routeMouse(ctx: RouterContext): Route {
  // The primary mouse button draws/erases when an ink/eraser tool is active,
  // mirroring the pen (Req 13.5, 14.14).
  if (isEraserTool(ctx.activeTool)) {
    return { kind: 'ink-erase' };
  }
  if (isInkTool(ctx.activeTool)) {
    return { kind: 'ink-draw' };
  }
  // No ink tool: existing mouse behavior is unchanged in both Edit_Mode and
  // Present_Mode (Req 13.11). The edit route carries focus/note/crop/connector/
  // select/move/resize as well as the Present_Mode mouse behavior of Req 8.
  return { kind: 'edit' };
}
