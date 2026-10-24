/**
 * Pure coordinate-space conversions for the geometry service.
 *
 * Three spaces are involved (design "Coordinate systems"):
 *  - Screen: CSS pixels relative to the viewport (Pointer_Event clientX/Y).
 *  - Canvas (world): the infinite workspace. The Camera maps canvas -> screen
 *    via `screen = (canvas - pan) * zoom`; the inverse is
 *    `canvas = screen / zoom + pan`.
 *  - Page: relative to a single Page's top-left, independent of placement.
 *
 * Every function here is pure (no DOM, no mutation) so it can be property- and
 * unit-tested for round-trip identity (design: Req 2.1, 3.1, 4.3, 14.5).
 */

import type { Camera, PagePlacement, Point } from '../types';

/**
 * Convert a screen-space point to canvas/world coordinates.
 *
 * Inverse of {@link canvasToScreen}: `canvas = screen / zoom + pan`.
 */
export function screenToCanvas(p: Point, cam: Camera): Point {
  return {
    x: p.x / cam.zoom + cam.panX,
    y: p.y / cam.zoom + cam.panY,
  };
}

/**
 * Convert a canvas/world point to screen coordinates.
 *
 * `screen = (canvas - pan) * zoom`. Inverse of {@link screenToCanvas}.
 */
export function canvasToScreen(p: Point, cam: Camera): Point {
  return {
    x: (p.x - cam.panX) * cam.zoom,
    y: (p.y - cam.panY) * cam.zoom,
  };
}

/**
 * Convert a point in a single Page's coordinate space (origin at the page's
 * top-left, measured in intrinsic PDF points) to canvas/world coordinates,
 * using the page's current placement.
 *
 * The placement gives the bijection: the page rectangle on the canvas has size
 * `rect.width x rect.height` for an intrinsic page of `pageWidth x pageHeight`,
 * so page coordinates scale by `rect.width / pageWidth` (x) and
 * `rect.height / pageHeight` (y) and are offset by the rectangle's top-left.
 *
 * Inverse of {@link canvasToPage}.
 */
export function pageToCanvas(p: Point, page: PagePlacement): Point {
  const { rect, pageWidth, pageHeight } = page;
  const sx = rect.width / pageWidth;
  const sy = rect.height / pageHeight;
  return {
    x: rect.x + p.x * sx,
    y: rect.y + p.y * sy,
  };
}

/**
 * Convert a canvas/world point to a single Page's coordinate space using the
 * page's current placement.
 *
 * Inverse of {@link pageToCanvas}.
 */
export function canvasToPage(p: Point, page: PagePlacement): Point {
  const { rect, pageWidth, pageHeight } = page;
  const sx = rect.width / pageWidth;
  const sy = rect.height / pageHeight;
  return {
    x: (p.x - rect.x) / sx,
    y: (p.y - rect.y) / sy,
  };
}
