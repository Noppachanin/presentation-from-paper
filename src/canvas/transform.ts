/**
 * Pure helpers shared by the canvas layers (task 13.1).
 *
 * ## One shared Camera transform
 * Every layer in the surface stack is positioned by the **same** Camera, applied
 * once as a CSS transform on each layer's content container. The design
 * ("Rendering architecture") says all layers share the Camera transform so they
 * stay registered pixel-for-pixel. We use a single CSS transform rather than
 * converting each element with `canvasToScreen`, because:
 *   - it keeps the transform math in one place (here),
 *   - the browser composites the whole layer with one matrix (cheap, GPU), and
 *   - child elements can be positioned in plain **canvas coordinates** (their
 *     natural storage space) with no per-element conversion.
 *
 * The Camera maps canvas → screen via `screen = (canvas - pan) * zoom`
 * (geometry/coords.ts). Expressed as a CSS transform applied to a container
 * whose children are laid out at their canvas coordinates, that is a scale by
 * `zoom` followed by a translate by `-pan * zoom`:
 *
 *   transform: translate(-panX*zoom px, -panY*zoom px) scale(zoom)
 *   transform-origin: 0 0
 *
 * A child placed at CSS `left: cx, top: cy` (its canvas coords) then lands at
 * screen `(cx - panX) * zoom`, exactly `canvasToScreen`.
 *
 * These helpers are pure (no DOM, no React) so the windowing and transform math
 * are unit-testable without mounting a component.
 */

import type { Camera, PagePlacement, RectCanvas, Viewport } from '../types';

/**
 * The CSS `transform` string that applies a Camera to a layer container whose
 * children are positioned in canvas coordinates. Pair with
 * `transform-origin: 0 0`.
 *
 * `screen = (canvas - pan) * zoom` ⇒ `translate(-pan*zoom) scale(zoom)`.
 */
export function cameraTransform(camera: Camera): string {
  const tx = -camera.panX * camera.zoom;
  const ty = -camera.panY * camera.zoom;
  return `translate(${tx}px, ${ty}px) scale(${camera.zoom})`;
}

/**
 * The canvas-space rectangle currently visible through the viewport for a given
 * Camera. Inverts `screen = (canvas - pan) * zoom` at the viewport's screen
 * corners `(0,0)` and `(width,height)`:
 *   canvasX = screenX / zoom + panX.
 */
export function visibleCanvasRect(camera: Camera, viewport: Viewport): RectCanvas {
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  return { x: camera.panX, y: camera.panY, width, height };
}

/** Whether two axis-aligned rectangles overlap (touching edges count as overlap). */
function rectsIntersect(a: RectCanvas, b: RectCanvas): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/**
 * Compute the set of pages whose canvas rectangle intersects the viewport,
 * expanded by `marginPx` **screen pixels** on every side (Req 1.7 windowing).
 * The margin is converted to canvas units by dividing by the zoom so a constant
 * screen margin keeps roughly the same number of off-screen pages warm at any
 * zoom.
 *
 * Returns the zero-based page indices in ascending order. Pure: no rendering,
 * no side effects — the PageLayer uses the result to decide which pages to
 * render and which to release.
 *
 * @param placements All page placements (canvas-space rectangles).
 * @param camera     The live Camera.
 * @param viewport   The viewport size in screen pixels.
 * @param marginPx   Extra margin around the viewport, in screen pixels.
 */
export function visiblePageIndices(
  placements: readonly PagePlacement[],
  camera: Camera,
  viewport: Viewport,
  marginPx = 0,
): number[] {
  const view = visibleCanvasRect(camera, viewport);
  const marginCanvas = camera.zoom > 0 ? marginPx / camera.zoom : 0;
  const expanded: RectCanvas = {
    x: view.x - marginCanvas,
    y: view.y - marginCanvas,
    width: view.width + 2 * marginCanvas,
    height: view.height + 2 * marginCanvas,
  };

  return placements
    .filter((p) => rectsIntersect(p.rect, expanded))
    .map((p) => p.pageIndex)
    .sort((a, b) => a - b);
}
