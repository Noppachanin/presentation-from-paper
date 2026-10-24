/**
 * Pure axis-aligned rectangle math for the geometry service.
 *
 * `RectCanvas` and `RectPage` are structurally identical (`{ x, y, width,
 * height }`), so these helpers accept a minimal structural `Rect` shape and
 * work in whichever coordinate space the caller is operating in. Rectangles are
 * assumed to have non-negative `width`/`height` with `(x, y)` at the top-left
 * corner (extending right and down), matching the shared type contracts.
 *
 * Nothing here touches the DOM or mutates its inputs, so every function is
 * safe to property- and unit-test (design: Req 3.4 focus clamping, Req 5.5
 * nearest-edge connector endpoints).
 */

import type { Point } from '../types';

/** Minimal structural rectangle shared by `RectCanvas` and `RectPage`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clamp `value` into the inclusive range `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Whether `p` lies within `rect`, inclusive of the rectangle's edges.
 */
export function containsPoint(rect: Rect, p: Point): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

/**
 * Whether `inner` is fully contained within `outer` (inclusive of edges).
 */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Clamp `rect` so it lies entirely within `bounds`, preserving `rect`'s size
 * when possible (used for Focus_Area clamping, Req 3.4).
 *
 * The position is shifted so the rectangle fits inside `bounds`. If `rect` is
 * larger than `bounds` along an axis, its size on that axis is reduced to the
 * bounds' size and it is pinned to the bounds' origin on that axis, so the
 * result is always fully contained.
 */
export function clampRectWithin<R extends Rect>(rect: R, bounds: Rect): R {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  const x = clamp(rect.x, bounds.x, bounds.x + bounds.width - width);
  const y = clamp(rect.y, bounds.y, bounds.y + bounds.height - height);
  return { ...rect, x, y, width, height };
}

/** A pair of connector endpoints, one on each of two rectangles' boundaries. */
export interface EdgePointPair {
  /** Point on the boundary of the first rectangle, nearest the second. */
  from: Point;
  /** Point on the boundary of the second rectangle, nearest the first. */
  to: Point;
}

/** Clamp `p` to the closest point on `rect` (inside stays put). */
function closestPointInRect(rect: Rect, p: Point): Point {
  return {
    x: clamp(p.x, rect.x, rect.x + rect.width),
    y: clamp(p.y, rect.y, rect.y + rect.height),
  };
}

/** The center of a rectangle. */
function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Project a point onto the boundary (perimeter) of a rectangle.
 *
 * If the point is outside the rectangle, the nearest boundary point is the
 * clamp of the point onto the rectangle. If the point is inside, it is pushed
 * out to whichever of the four edges is closest.
 */
function nearestBoundaryPoint(rect: Rect, p: Point): Point {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const inside = p.x > left && p.x < right && p.y > top && p.y < bottom;
  if (!inside) {
    return closestPointInRect(rect, p);
  }

  // Inside: snap to the nearest of the four edges.
  const distLeft = p.x - left;
  const distRight = right - p.x;
  const distTop = p.y - top;
  const distBottom = bottom - p.y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);

  if (min === distLeft) return { x: left, y: p.y };
  if (min === distRight) return { x: right, y: p.y };
  if (min === distTop) return { x: p.x, y: top };
  return { x: p.x, y: bottom };
}

/**
 * Compute connector endpoints for two rectangles: each endpoint is the point on
 * one rectangle's boundary nearest the other rectangle (Req 5.5).
 *
 * Each rectangle's endpoint is found by projecting the other rectangle's center
 * onto this rectangle's boundary, then refining `from` against the resulting
 * `to` (and vice versa) so the endpoints face each other even when the centers
 * are not the closest features. The result lies on the respective boundaries.
 */
export function nearestEdgePointsBetweenRects(a: Rect, b: Rect): EdgePointPair {
  const centerA = centerOf(a);
  const centerB = centerOf(b);

  // First pass: aim each boundary point at the other rectangle's center.
  let from = nearestBoundaryPoint(a, centerB);
  let to = nearestBoundaryPoint(b, centerA);

  // Refinement pass: aim each boundary point at the other's current endpoint so
  // overlapping or offset rectangles still get mutually nearest endpoints.
  from = nearestBoundaryPoint(a, to);
  to = nearestBoundaryPoint(b, from);

  return { from, to };
}
