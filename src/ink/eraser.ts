/**
 * Eraser hit-testing for the Eraser_Tool (design: Req 14.15).
 *
 * The eraser removes a WHOLE Ink_Stroke when the eraser point comes within 12
 * SCREEN pixels of any part of that stroke, and spares every other stroke.
 *
 * Coordinate spaces: Ink_Strokes (and the eraser point passed in) are stored in
 * canvas (world) coordinates, while the 12px threshold is a SCREEN distance. The
 * Camera maps canvas -> screen by scaling with `zoom` (`screenDist = canvasDist
 * * zoom`), so the 12 screen-pixel radius is `12 / zoom` in canvas units. We do
 * the whole computation in canvas units against that derived radius, which
 * avoids projecting every stroke point to screen space.
 *
 * Hit test: the eraser hits a stroke when the minimum distance from the eraser
 * point to the stroke's polyline is <= the canvas radius. For a multi-point
 * stroke that is the minimum point-to-segment distance over all segments; for a
 * single-point stroke it degenerates to point-to-point distance; an empty
 * stroke (no points) can never be hit.
 *
 * Pure: no DOM, no mutation. Strokes keep their original object identity in the
 * returned `removed` / `remaining` arrays.
 */

import type { InkPoint, InkStroke } from '../types';

/** Eraser radius in screen pixels (design: Req 14.15). */
export const ERASER_SCREEN_RADIUS_PX = 12;

/** The result of an eraser hit test over a set of strokes. */
export interface EraseResult {
  /** Strokes the eraser touched (to be removed). */
  removed: InkStroke[];
  /** Strokes the eraser did not touch (to be kept). */
  remaining: InkStroke[];
}

/**
 * Squared distance from point `p` to the segment `a`-`b`, all in canvas units.
 * Using the squared distance avoids a `sqrt` per segment; callers compare it to
 * the squared radius.
 */
function segmentDistanceSquared(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLenSq = abx * abx + aby * aby;

  // Degenerate segment (a === b): fall back to point-to-point distance.
  if (abLenSq === 0) {
    return apx * apx + apy * apy;
  }

  // Project p onto the segment and clamp the parameter to [0, 1] so the closest
  // point stays on the segment rather than its infinite line.
  let t = (apx * abx + apy * aby) / abLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy;
}

/**
 * Whether the eraser point is within `canvasRadius` of the stroke's polyline.
 */
function strokeIsHit(stroke: InkStroke, point: InkPoint, canvasRadius: number): boolean {
  const points = stroke.points;
  if (points.length === 0) {
    return false;
  }

  const radiusSq = canvasRadius * canvasRadius;

  // Single-point stroke (a dot): point-to-point distance.
  if (points.length === 1) {
    const dx = point.x - points[0].x;
    const dy = point.y - points[0].y;
    return dx * dx + dy * dy <= radiusSq;
  }

  // Multi-point stroke: minimum distance to any segment of the polyline.
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentDistanceSquared(point, points[i], points[i + 1]) <= radiusSq) {
      return true;
    }
  }
  return false;
}

/**
 * Partition `strokes` into the ones the eraser touches and the ones it spares.
 *
 * @param strokes     The current set of Ink_Strokes, in canvas coordinates.
 * @param pointCanvas The eraser contact point, in canvas coordinates. Only `x`
 *                    and `y` are used; any `pressure` value is ignored.
 * @param zoom        The Camera zoom at erase time; converts the 12 screen-pixel
 *                    radius to canvas units (`12 / zoom`). A non-finite or
 *                    non-positive zoom erases nothing (every stroke is spared),
 *                    so a bad camera state never destroys ink.
 * @returns `{ removed, remaining }` preserving input order and object identity.
 */
export function eraseAt(
  strokes: InkStroke[],
  pointCanvas: { x: number; y: number },
  zoom: number,
): EraseResult {
  const removed: InkStroke[] = [];
  const remaining: InkStroke[] = [];

  const canvasRadius = ERASER_SCREEN_RADIUS_PX / zoom;

  // Guard against a non-finite/non-positive radius (bad zoom): keep everything.
  if (!Number.isFinite(canvasRadius) || canvasRadius <= 0) {
    return { removed, remaining: strokes.slice() };
  }

  const point: InkPoint = { x: pointCanvas.x, y: pointCanvas.y, pressure: 0 };

  for (const stroke of strokes) {
    if (strokeIsHit(stroke, point, canvasRadius)) {
      removed.push(stroke);
    } else {
      remaining.push(stroke);
    }
  }

  return { removed, remaining };
}
