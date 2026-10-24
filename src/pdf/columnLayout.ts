/**
 * Pure column-layout math for the PDF_Loader (Req 1.2).
 *
 * The PDF_Loader arranges every Page in a single vertical column with a
 * constant gap between consecutive Pages. This module isolates that geometry as
 * a pure function of the intrinsic page sizes and the gap, so it is trivially
 * unit- and property-testable without PDF.js or the DOM.
 *
 * The result is a {@link PagePlacement}[] in canvas/world coordinates: each
 * page keeps its intrinsic (scale-1) size, pages are stacked top to bottom with
 * `gap` canvas units between them, and every page is left-aligned at `x = 0`.
 * (A later layout step may re-center pages horizontally, but the single-column,
 * constant-gap invariant is what Req 1.2 constrains and what this computes.)
 */

import type { PagePlacement } from '../types';

/**
 * The constant vertical gap, in canvas units, left between consecutive pages in
 * the column (Req 1.2). Default used by {@link layoutColumn} and
 * {@link openPdf} when no explicit gap is supplied.
 */
export const PAGE_GAP = 24;

/** The intrinsic (unscaled, scale-1) size of a single PDF page, in PDF points. */
export interface PageSize {
  /** Intrinsic page width in PDF points. */
  width: number;
  /** Intrinsic page height in PDF points. */
  height: number;
}

/**
 * Lay out pages in a single vertical column with a constant gap.
 *
 * Pages are stacked from `y = 0` downward in input order. Page `i` is placed
 * directly below page `i - 1` with exactly `gap` canvas units of empty space
 * between them, so consecutive pages never overlap and the gap is identical
 * everywhere (Req 1.2). Each placement carries its index and intrinsic size so
 * the PageLayer can show a correctly sized placeholder before the bitmap is
 * ready (Req 1.3) and map Page <-> canvas coordinates.
 *
 * `gap` is clamped to be non-negative; a negative or non-finite gap is treated
 * as `0` so pages are never laid out overlapping. A page with a non-finite or
 * non-positive dimension is coerced to `0` for that dimension so a malformed
 * page cannot push subsequent pages to NaN positions.
 *
 * @param sizes Intrinsic page sizes, one per page, in document order.
 * @param gap   Constant vertical gap between consecutive pages, in canvas units
 *              (default {@link PAGE_GAP}).
 * @returns One {@link PagePlacement} per input size, in the same order.
 */
export function layoutColumn(
  sizes: PageSize[],
  gap: number = PAGE_GAP,
): PagePlacement[] {
  const safeGap = Number.isFinite(gap) && gap > 0 ? gap : 0;
  const placements: PagePlacement[] = [];
  let y = 0;

  for (let pageIndex = 0; pageIndex < sizes.length; pageIndex++) {
    const raw = sizes[pageIndex];
    const width = Number.isFinite(raw.width) && raw.width > 0 ? raw.width : 0;
    const height = Number.isFinite(raw.height) && raw.height > 0 ? raw.height : 0;
    placements.push({
      pageIndex,
      rect: { x: 0, y, width, height },
      pageWidth: width,
      pageHeight: height,
    });
    // Advance past this page plus one gap for the next page's top edge.
    y += height + safeGap;
  }

  return placements;
}
