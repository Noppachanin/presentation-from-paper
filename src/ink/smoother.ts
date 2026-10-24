/**
 * Stroke_Smoother: reduces the sampled points of an Ink_Stroke before rendering.
 *
 * Ink points are stored in canvas (world) coordinates, so the sub-pixel test is
 * performed in screen space by scaling the canvas-space distance by the Camera
 * zoom: `screenDist = canvasDist * zoom`. Equivalently, a point is dropped when
 * its canvas-space distance from the last kept point is below the canvas-space
 * threshold `minScreenPx / zoom`.
 *
 * Contract (design: Req 14.10, 14.11):
 *  - Drop consecutive points closer than `minScreenPx` screen pixels from the
 *    previously kept point.
 *  - Always preserve the first and the last point of the stroke.
 *  - Deterministic: identical input yields identical output.
 *  - A single-point stroke is preserved unchanged (rendered later as a dot).
 *
 * The function is pure: it never touches the DOM and never mutates its inputs
 * (the returned points are the same object references, in a fresh array).
 */

import type { InkPoint } from '../types';

/**
 * Euclidean distance between two points in canvas coordinates.
 */
function canvasDistance(a: InkPoint, b: InkPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Drop consecutive points closer than `minScreenPx` screen pixels while always
 * preserving the first and last point of the stroke.
 *
 * @param points     The sampled stroke points, in canvas coordinates.
 * @param minScreenPx The minimum spacing between kept points, in screen pixels
 *                    (design default: 1).
 * @param zoom        The Camera zoom at draw time; maps canvas distance to
 *                    screen distance. Non-finite or non-positive zoom disables
 *                    thinning (all points are kept) so the data is never lost.
 * @returns A new array of the kept points (same point object references).
 */
export function smooth(points: InkPoint[], minScreenPx: number, zoom: number): InkPoint[] {
  // Zero or one point: nothing to thin; preserve as-is (single-point -> dot).
  if (points.length <= 1) {
    return points.slice();
  }

  // Guard against a non-positive/non-finite threshold or zoom: keep everything
  // rather than risk dropping points or dividing by zero.
  const canvasThreshold = minScreenPx / zoom;
  if (!Number.isFinite(canvasThreshold) || canvasThreshold <= 0) {
    return points.slice();
  }

  const lastIndex = points.length - 1;
  const result: InkPoint[] = [points[0]];
  let lastKept = points[0];

  // Walk the interior points, keeping any that are at least the threshold away
  // from the last kept point. The final point is always appended afterwards so
  // it is preserved even if it is within the threshold of the last kept point.
  for (let i = 1; i < lastIndex; i++) {
    const p = points[i];
    if (canvasDistance(p, lastKept) >= canvasThreshold) {
      result.push(p);
      lastKept = p;
    }
  }

  result.push(points[lastIndex]);
  return result;
}
