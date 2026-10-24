/**
 * Camera model and transition math for the PDF Presentation Canvas.
 *
 * The Camera is `{ panX, panY, zoom }` in canvas (world) units. It maps canvas
 * coordinates to screen pixels via `screen = (canvas - pan) * zoom` (see
 * geometry/coords.ts). Every function in this module is PURE: no DOM access, no
 * `requestAnimationFrame`, no mutation of inputs. The rAF loop that drives real
 * transitions lives in the app shell (task 15.1); this module only provides the
 * pure building blocks it composes.
 *
 * Responsibilities (design "Camera and transition model"):
 *  - clampZoom         — keep zoom within [0.05, 8.0]                 (Req 2.4)
 *  - cameraForTarget   — fit a target rect with a 10% margin          (Req 7.1, 2.5)
 *  - transitionDuration — distance-scaled duration in [600, 1500] ms  (Req 7.3)
 *  - interpolateCamera — ease-in-out pan + zoom, with a zoom-out-then-in
 *                        arc for far targets                          (Req 7.2, 7.4, 7.8)
 *  - startTransition / sampleTransition — interruptible transition helpers that
 *                        start from the current interpolated Camera   (Req 7.6)
 *  - instantTransition — reduce-motion instant-set path               (Req 7.7)
 */

import type { Camera, RectCanvas, Viewport } from '../types';

/** Minimum Camera zoom scale (Req 2.4). */
export const MIN_ZOOM = 0.05;
/** Maximum Camera zoom scale (Req 2.4). */
export const MAX_ZOOM = 8.0;

/** Fraction of the viewport kept clear on each side when fitting a target. */
export const FIT_MARGIN = 0.1;

/** Lower bound of a Transition duration in milliseconds (Req 7.3). */
export const MIN_DURATION_MS = 600;
/** Upper bound of a Transition duration in milliseconds (Req 7.3). */
export const MAX_DURATION_MS = 1500;

/**
 * Clamp a zoom scale to the supported range `[MIN_ZOOM, MAX_ZOOM]` (Req 2.4).
 *
 * A non-finite input (NaN/Infinity) is coerced to the nearest bound so callers
 * never propagate garbage: `NaN -> MIN_ZOOM`, `+Infinity -> MAX_ZOOM`.
 */
export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return MIN_ZOOM;
  if (z < MIN_ZOOM) return MIN_ZOOM;
  if (z > MAX_ZOOM) return MAX_ZOOM;
  return z;
}

/**
 * Compute the Camera that fits `target` (a canvas-space rectangle) in the
 * viewport with a {@link FIT_MARGIN} (10%) margin on every side, centering the
 * target in the viewport (Req 7.1).
 *
 * The usable area is `(1 - 2 * FIT_MARGIN)` of each viewport dimension. The zoom
 * is the largest scale that still fits both dimensions, clamped to the zoom
 * range. The pan places the target centre at the viewport centre, inverting the
 * `screen = (canvas - pan) * zoom` transform so that
 * `panX = targetCentreX - (viewport.width / 2) / zoom`.
 *
 * Degenerate targets (zero/negative/non-finite width or height) fall back to a
 * zoom of 1 for that axis so the result is always a finite, usable Camera.
 */
export function cameraForTarget(target: RectCanvas, viewport: Viewport): Camera {
  const usableW = viewport.width * (1 - 2 * FIT_MARGIN);
  const usableH = viewport.height * (1 - 2 * FIT_MARGIN);

  const zoomX = target.width > 0 && Number.isFinite(target.width) ? usableW / target.width : 1;
  const zoomY = target.height > 0 && Number.isFinite(target.height) ? usableH / target.height : 1;

  const zoom = clampZoom(Math.min(zoomX, zoomY));

  const targetCentreX = target.x + target.width / 2;
  const targetCentreY = target.y + target.height / 2;

  return {
    panX: targetCentreX - viewport.width / 2 / zoom,
    panY: targetCentreY - viewport.height / 2 / zoom,
    zoom,
  };
}

/**
 * The canvas-space point that sits at the centre of the viewport for a given
 * Camera. This is what the eye is "looking at", so inter-target distance is
 * measured between the two cameras' focus points rather than their raw pan
 * offsets (which also shift with zoom).
 */
function focusPoint(cam: Camera, viewport: Viewport): { x: number; y: number } {
  return {
    x: cam.panX + viewport.width / 2 / cam.zoom,
    y: cam.panY + viewport.height / 2 / cam.zoom,
  };
}

/**
 * Canvas-space distance between the focus points of two cameras (Req 7.3, 7.2).
 */
function focusDistance(a: Camera, b: Camera, viewport: Viewport): number {
  const fa = focusPoint(a, viewport);
  const fb = focusPoint(b, viewport);
  return Math.hypot(fb.x - fa.x, fb.y - fa.y);
}

/**
 * The on-screen span, in screen pixels, that the canvas-space focus distance
 * occupies at the coarser (more zoomed-out) of the two cameras. Measuring at
 * the smaller zoom keeps the value well-defined even when one endpoint is zoomed
 * far in, and gives a natural "how many viewports apart" scale when divided by
 * the viewport size.
 */
function screenSpan(a: Camera, b: Camera, viewport: Viewport): number {
  const dist = focusDistance(a, b, viewport);
  const zoom = Math.min(a.zoom, b.zoom);
  return dist * zoom;
}

/**
 * Compute a Transition duration in milliseconds that scales with the distance
 * between two Step targets and is clamped to `[600, 1500]` ms (Req 7.3).
 *
 * The duration is monotonic non-decreasing in distance: larger inter-target
 * distances never produce a shorter duration. The distance is measured in
 * screen pixels (see {@link screenSpan}) and mapped linearly so that a span of
 * one viewport width reaches roughly the midpoint of the range, then clamped.
 */
export function transitionDuration(a: Camera, b: Camera, viewport: Viewport): number {
  const span = screenSpan(a, b, viewport);
  // Normalise by the viewport diagonal so the scale is resolution-independent.
  const reference = Math.max(1, Math.hypot(viewport.width, viewport.height));
  const fraction = span / reference; // 0 at identical targets, ~1 at a diagonal apart.

  const raw = MIN_DURATION_MS + fraction * (MAX_DURATION_MS - MIN_DURATION_MS);
  if (!Number.isFinite(raw) || raw > MAX_DURATION_MS) return MAX_DURATION_MS;
  if (raw < MIN_DURATION_MS) return MIN_DURATION_MS;
  return raw;
}

/**
 * Cubic ease-in-out easing on `t in [0, 1]`. Returns exactly 0 at `t = 0` and
 * exactly 1 at `t = 1`, so interpolation hits its endpoints precisely (Req 7.4,
 * 7.8). Inputs outside `[0, 1]` are clamped.
 */
export function easeInOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Whether a transition between two cameras should use the zoom-out-then-in arc:
 * the focus points are more than twice the viewport size apart (Req 7.2).
 */
export function needsZoomOutArc(a: Camera, b: Camera, viewport: Viewport): boolean {
  const span = screenSpan(a, b, viewport);
  const viewportSize = Math.hypot(viewport.width, viewport.height);
  return span > 2 * viewportSize;
}

/**
 * Interpolate between two cameras at parameter `t in [0, 1]` with ease-in-out
 * applied to pan and zoom (Req 7.4). Returns exactly `a` at `t = 0` and exactly
 * `b` at `t = 1` so a completed transition snaps to the target with no float
 * drift (Req 7.8).
 *
 * Zoom is interpolated geometrically (in log space) so equal multiplicative
 * steps look uniform — the natural feel for zooming. When the targets are far
 * apart (see {@link needsZoomOutArc}) the zoom follows a **zoom-out-then-in**
 * arc that dips below the straight-line zoom at the midpoint, pulling the view
 * back far enough that both targets are visible mid-transition (the Prezi /
 * van-Wijk smooth-zoom idea, Req 7.2). The dip is applied symmetrically and
 * vanishes at both endpoints, preserving the exact-endpoint guarantee.
 *
 * @param viewport Optional viewport. Required to decide on and shape the
 *   zoom-out arc; when omitted the zoom is a plain geometric interpolation.
 */
export function interpolateCamera(
  a: Camera,
  b: Camera,
  t: number,
  viewport?: Viewport,
): Camera {
  if (t <= 0) return { panX: a.panX, panY: a.panY, zoom: a.zoom };
  if (t >= 1) return { panX: b.panX, panY: b.panY, zoom: b.zoom };

  const e = easeInOut(t);

  // Pan interpolates linearly under easing.
  const panX = a.panX + (b.panX - a.panX) * e;
  const panY = a.panY + (b.panY - a.panY) * e;

  // Zoom interpolates in log space (geometric) for uniform perceived steps.
  const logA = Math.log(a.zoom);
  const logB = Math.log(b.zoom);
  let logZoom = logA + (logB - logA) * e;

  // Zoom-out-then-in arc for far targets: subtract a bump that is zero at the
  // endpoints and maximal mid-transition, lowering the zoom (log space) so both
  // targets fit on screen in the middle of the move (Req 7.2).
  if (viewport && needsZoomOutArc(a, b, viewport)) {
    const span = screenSpan(a, b, viewport);
    const viewportSize = Math.max(1, Math.hypot(viewport.width, viewport.height));
    // How many "extra" viewports we must pull back to frame both targets.
    const extraViewports = span / viewportSize;
    // Amount (in log-zoom units) to dip at the midpoint; grows with distance.
    const dipMagnitude = Math.log(extraViewports);
    // Bell curve: 0 at e=0 and e=1, 1 at e=0.5.
    const bump = Math.sin(Math.PI * e);
    logZoom -= dipMagnitude * bump;
  }

  const zoom = clampZoom(Math.exp(logZoom));

  return { panX, panY, zoom };
}

/**
 * A running Camera transition. The rAF loop (task 15.1) owns the wall-clock; it
 * creates a Transition with {@link startTransition} and samples it each frame
 * with {@link sampleTransition}. This struct is plain data so it can be stored,
 * copied, and reasoned about in tests without any timers.
 */
export interface CameraTransition {
  /** Camera at the start of the transition (the interrupted/current camera). */
  readonly from: Camera;
  /** Camera at the end of the transition (the exact target). */
  readonly to: Camera;
  /** Timestamp (ms) at which the transition started. */
  readonly startTime: number;
  /** Total duration in ms, already clamped to [600, 1500]. */
  readonly duration: number;
  /** Viewport used to shape the zoom-out arc, captured at start. */
  readonly viewport: Viewport;
}

/**
 * Begin a transition toward `to`, starting from `from` — which, when a previous
 * transition is still running, is that transition's *current interpolated
 * Camera* rather than its old target (Req 7.6). Callers interrupting a running
 * transition should pass `sampleTransition(prev, now).camera` (or the live
 * store Camera) as `from`.
 *
 * The duration is computed from the from/to distance and clamped (Req 7.3).
 */
export function startTransition(
  from: Camera,
  to: Camera,
  viewport: Viewport,
  now: number,
): CameraTransition {
  return {
    from: { panX: from.panX, panY: from.panY, zoom: from.zoom },
    to: { panX: to.panX, panY: to.panY, zoom: to.zoom },
    startTime: now,
    duration: transitionDuration(from, to, viewport),
    viewport: { width: viewport.width, height: viewport.height },
  };
}

/**
 * Sample a transition at wall-clock time `now`, returning the current Camera and
 * whether the transition has finished. At or after `startTime + duration` the
 * Camera is snapped to the exact target and `done` is `true` (Req 7.8). A
 * zero-or-negative duration completes immediately.
 */
export function sampleTransition(
  transition: CameraTransition,
  now: number,
): { camera: Camera; done: boolean } {
  const { from, to, startTime, duration, viewport } = transition;
  if (duration <= 0 || now >= startTime + duration) {
    return { camera: { panX: to.panX, panY: to.panY, zoom: to.zoom }, done: true };
  }
  const t = (now - startTime) / duration;
  return { camera: interpolateCamera(from, to, t, viewport), done: false };
}

/**
 * The reduce-motion / `prefers-reduced-motion` instant-set path: skip the
 * animation and return the exact target Camera (Req 7.7). Provided as a named
 * helper so the app shell can branch on the reduce-motion setting without
 * duplicating the "snap to target" semantics.
 */
export function instantTransition(to: Camera): Camera {
  return { panX: to.panX, panY: to.panY, zoom: to.zoom };
}
