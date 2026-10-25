/**
 * Minimal Crop-render path for the ItemLayer (task 13.1, Req 4.4).
 *
 * A Crop shows a rectangular region of a source Page re-rendered onto its own
 * `<canvas>` at a resolution matching the Crop's on-canvas display size (Req
 * 4.4). The {@link PdfPageRenderer} in `src/pdf` only renders whole pages, and
 * this task must not modify that module, so the ItemLayer renders a Crop with
 * this small, self-contained path built on the same PDF.js document proxy and
 * the shared {@link clampRenderScale} guard (so the Safari canvas-area limit is
 * respected exactly as for full pages).
 *
 * ## Approach
 * PDF.js can render a sub-region by building a page viewport at the chosen scale
 * and then *shifting and shrinking the canvas* to the source rectangle:
 *   - `scale` is derived so the source region fills the Crop's display size:
 *     `scale = displayWidthDevicePx / sourceWidthInPoints`, clamped to the
 *     Safari area limit using the CROP's point size (not the whole page).
 *   - A full-page viewport is built at that scale, then translated by
 *     `getViewport({ scale, offsetX, offsetY })` so the source region's
 *     top-left maps to the canvas origin.
 *   - The canvas is sized to just the source region (`sourceW*scale` by
 *     `sourceH*scale`), so PDF.js paints only that region.
 *
 * This keeps the Crop bitmap resolution-matched to its display size and never
 * exceeds the per-crop area limit. It can be refined in later tasks (caching,
 * re-render on zoom settle); for 13.1 it renders correctly on demand.
 *
 * This module imports (and does not modify) {@link clampRenderScale} from
 * `../pdf`. It takes the PDF.js document proxy via the `LoadedPdf.document`
 * that the ItemLayer receives as a prop, so it stays decoupled from how the PDF
 * was opened (that wiring is task 15.1).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RectPage } from '../types';
import { clampRenderScale } from '../pdf';

/** The result of a Crop render: the bitmap and the scale actually used. */
export interface RenderedCrop {
  /** The canvas holding the rendered source region. */
  readonly canvas: HTMLCanvasElement;
  /** The render scale actually used (after the Safari area clamp). */
  readonly scale: number;
}

/**
 * Render the `source` region of page `sourcePageIndex` (zero-based) onto a new
 * canvas sized so the region is shown at roughly `displayWidthPx` CSS pixels
 * wide. A `devicePixelRatio` multiplier keeps the bitmap crisp on HiDPI
 * displays; the resulting scale is clamped so the crop bitmap stays within the
 * Safari canvas-area limit (Req 4.4, 15.5).
 *
 * @param document        The open PDF.js document (from `LoadedPdf.document`).
 * @param sourcePageIndex Zero-based source page index.
 * @param source          Source region in Page coordinates (PDF points).
 * @param displayWidthPx  Desired on-screen width of the crop, in CSS pixels.
 * @param pixelRatio      Device pixel ratio to oversample for (default 1).
 * @returns The rendered crop, or `undefined` when the region/scale is degenerate.
 */
export async function renderCrop(
  document: PDFDocumentProxy,
  sourcePageIndex: number,
  source: RectPage,
  displayWidthPx: number,
  pixelRatio = 1,
): Promise<RenderedCrop | undefined> {
  if (
    source.width <= 0 ||
    source.height <= 0 ||
    displayWidthPx <= 0 ||
    !Number.isFinite(displayWidthPx)
  ) {
    return undefined;
  }

  // PDF.js page numbers are 1-based.
  const page = await document.getPage(sourcePageIndex + 1);

  // Scale that makes the source region fill the requested display width, then
  // oversample for the device pixel ratio.
  const requestedScale = (displayWidthPx * pixelRatio) / source.width;

  // Clamp using the CROP's point size so the crop bitmap (not the whole page)
  // stays within the Safari area limit (Req 4.4).
  const scale = clampRenderScale(source.width, source.height, requestedScale);
  if (scale <= 0) {
    return undefined;
  }

  // Build a page viewport at the chosen scale, then shift it so the source
  // region's top-left lands at the canvas origin. PDF.js applies offsetX/offsetY
  // in the already-scaled (device) space.
  const scaledViewport = page.getViewport({
    scale,
    offsetX: -source.x * scale,
    offsetY: -source.y * scale,
  });

  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));

  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return undefined;
  }

  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

  return { canvas, scale };
}
