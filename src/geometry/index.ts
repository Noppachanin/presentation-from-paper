/**
 * Geometry service barrel.
 *
 * Pure coordinate-space conversions and rectangle math shared across the app.
 * Import from `../geometry` (or `@/geometry`) rather than the individual files
 * so the module layout can change without touching call sites.
 */

export { screenToCanvas, canvasToScreen, pageToCanvas, canvasToPage } from './coords';
export {
  containsPoint,
  containsRect,
  clampRectWithin,
  nearestEdgePointsBetweenRects,
} from './rect';
export type { Rect, EdgePointPair } from './rect';
