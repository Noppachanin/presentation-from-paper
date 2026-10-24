/**
 * Render-scale clamp for the Safari iPadOS canvas area limit.
 *
 * Safari on iPadOS caps the area (width * height) of a canvas bitmap at
 * 16,777,216 px (4096 * 4096). Every Page and Crop render must keep its output
 * bitmap area at or below this limit, otherwise the canvas silently fails to
 * render on that platform. *(Req 15.5, Req 1.6, Req 4.4)*
 *
 * This module is a pure function with no DOM dependency so it is trivially
 * unit- and property-testable.
 */

/**
 * The maximum canvas bitmap area (in pixels) that Safari on iPadOS supports.
 * 16,777,216 = 4096 * 4096.
 */
export const SAFARI_MAX_CANVAS_AREA = 16_777_216;

/**
 * Clamp a requested render scale so the resulting bitmap area stays within the
 * Safari iPadOS canvas area limit.
 *
 * `w` and `h` are the UNSCALED page/crop dimensions (CSS px or PDF points). The
 * bitmap that would be produced is `(w * scale)` by `(h * scale)`, i.e. an area
 * of `w * h * scale^2`. When that area exceeds {@link SAFARI_MAX_CANVAS_AREA},
 * the scale is reduced by the factor `sqrt(limit / area)` so the resulting area
 * lands exactly at the limit; otherwise the scale is returned unchanged.
 *
 * Guards: if `w`, `h`, or `scale` is not a finite positive number, the function
 * cannot produce a meaningful bitmap, so it returns `0` (a zero-area bitmap is
 * always within the limit and signals "nothing to render").
 *
 * @param w     Unscaled width of the page/crop (px or PDF points).
 * @param h     Unscaled height of the page/crop (px or PDF points).
 * @param scale Requested render scale.
 * @returns The scale to actually use, guaranteed to keep `w*h*scale^2` at or
 *          below {@link SAFARI_MAX_CANVAS_AREA}.
 */
export function clampRenderScale(w: number, h: number, scale: number): number {
  // Reject non-finite or non-positive inputs: there is no sensible bitmap to
  // render, so return a zero scale (zero area, trivially within the limit).
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    !Number.isFinite(scale) ||
    w <= 0 ||
    h <= 0 ||
    scale <= 0
  ) {
    return 0;
  }

  const area = w * h * scale * scale;
  if (area <= SAFARI_MAX_CANVAS_AREA) {
    return scale;
  }

  // area > limit: scale down by sqrt(limit / area) so the new area equals the
  // limit exactly. new_area = w*h*(scale*factor)^2 = area * (limit/area) = limit.
  const factor = Math.sqrt(SAFARI_MAX_CANVAS_AREA / area);
  return scale * factor;
}
