/**
 * Current-page / zoom-readout helpers for the Toolbar (task 14.1, Req 2.6).
 *
 * These are pure functions over the live Camera, the viewport, and the page
 * placements so the Toolbar readouts are testable without mounting React.
 *
 *  - {@link zoomPercent} is the rounded percentage readout (`round(zoom*100)`).
 *  - {@link currentPageIndex} is the page whose canvas rectangle contains the
 *    viewport centre; it falls back to the nearest page by vertical distance
 *    when the centre lands in the gap between pages, and to `undefined` when no
 *    pages exist.
 *
 * The Camera maps canvas -> screen via `screen = (canvas - pan) * zoom`
 * (see src/types/geometry.ts), so the canvas point under a screen point `s` is
 * `canvas = s / zoom + pan`. We only need the viewport centre, so we invert the
 * transform for that single point rather than pulling in the geometry service.
 */

import type { Camera, PagePlacement, Point, Viewport } from '../types';

/** The rounded zoom percentage shown in the Toolbar (Req 2.6). */
export function zoomPercent(camera: Camera): number {
  return Math.round(camera.zoom * 100);
}

/** The canvas-space point under the centre of the viewport. */
export function viewportCenterCanvas(camera: Camera, viewport: Viewport): Point {
  const zoom = camera.zoom === 0 ? 1 : camera.zoom;
  return {
    x: viewport.width / 2 / zoom + camera.panX,
    y: viewport.height / 2 / zoom + camera.panY,
  };
}

/** Whether a canvas point lies inside a page placement's canvas rectangle. */
function rectContains(placement: PagePlacement, p: Point): boolean {
  const { rect } = placement;
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

/**
 * The zero-based index of the "current page": the page whose canvas rectangle
 * contains the viewport centre (Req 2.6). When the centre is in the gap between
 * pages, the nearest page by vertical distance to its rectangle wins; when
 * there are no pages, returns `undefined`.
 */
export function currentPageIndex(
  camera: Camera,
  viewport: Viewport,
  pages: readonly PagePlacement[],
): number | undefined {
  if (pages.length === 0) {
    return undefined;
  }
  const center = viewportCenterCanvas(camera, viewport);

  const containing = pages.find((p) => rectContains(p, center));
  if (containing !== undefined) {
    return containing.pageIndex;
  }

  // Fall back to the vertically nearest page (the column is laid out top to
  // bottom, so vertical distance is the meaningful metric).
  let best = pages[0];
  let bestDistance = verticalDistance(best, center.y);
  for (const p of pages) {
    const d = verticalDistance(p, center.y);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best.pageIndex;
}

/** Distance from `y` to a page's vertical span (0 when inside the span). */
function verticalDistance(placement: PagePlacement, y: number): number {
  const top = placement.rect.y;
  const bottom = placement.rect.y + placement.rect.height;
  if (y < top) return top - y;
  if (y > bottom) return y - bottom;
  return 0;
}

/**
 * The 1-based page number shown in the Toolbar (Req 2.6), or `undefined` when
 * no PDF is open. Derived from {@link currentPageIndex}.
 */
export function currentPageNumber(
  camera: Camera,
  viewport: Viewport,
  pages: readonly PagePlacement[],
): number | undefined {
  const index = currentPageIndex(camera, viewport, pages);
  return index === undefined ? undefined : index + 1;
}
