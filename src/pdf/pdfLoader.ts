/**
 * PDF_Loader — open a PDF locally and manage per-page rendering (Requirement 1).
 *
 * Responsibilities:
 *  - {@link openPdf}: load a picked/dropped PDF entirely in the browser with no
 *    network request (Req 1.4), exposing the PDF.js document, page count, the
 *    {@link PdfFingerprint}, and the computed vertical-column {@link PagePlacement}
 *    array with a constant gap (Req 1.1, 1.2). Intrinsic page sizes come from
 *    each page's scale-1 viewport so the PageLayer (task 13.1) can size a
 *    correctly-dimensioned placeholder before a bitmap exists (Req 1.3).
 *  - Named failure: a parse/load failure rejects with {@link PdfLoadError}, a
 *    named Error subclass wrapping the raw PDF.js error, so the caller can show
 *    an error that names the failure and keep the previous Canvas state (Req 1.5).
 *  - {@link PdfPageRenderer.renderPage}: render one page to a bitmap at a
 *    resolution matching the zoom, clamped by {@link clampRenderScale} for the
 *    Safari canvas-area limit (Req 1.6, 15.5). A debounced
 *    {@link PdfPageRenderer.scheduleRerender} fires once zoom settles (~500 ms,
 *    Req 1.6); the event wiring is task 13/15.
 *  - {@link PdfPageRenderer.releasePage}: free the bitmap of an off-screen page
 *    (Req 1.7).
 *
 * This module imports (and never modifies) the sibling helpers: the worker
 * wiring {@link configurePdfWorker}, the area clamp {@link clampRenderScale},
 * and the fingerprint extractor {@link extractFingerprint}. Pure column-layout
 * math lives in {@link layoutColumn} (layout.ts) for easy testing. React
 * components (the PageLayer) are out of scope here (task 13.1).
 */

import {
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';

import type { PagePlacement, PdfFingerprint } from '../types';
import { configurePdfWorker } from './pdfWorker';
import { extractFingerprint } from './fingerprint';
import { clampRenderScale } from './renderScale';
import { layoutColumn, PAGE_GAP, type PageSize } from './columnLayout';
import { debounce, ZOOM_SETTLE_MS, type TimerFns } from './debounce';

/**
 * A named error for any PDF open/parse failure (Req 1.5). The caller shows an
 * error that names the failure (`message`) and keeps the previous Canvas state;
 * the original PDF.js error is preserved on `cause` for diagnostics.
 */
export class PdfLoadError extends Error {
  override readonly name = 'PdfLoadError';
  /** The raw underlying error thrown by PDF.js (or other), if any. */
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    // Keep the prototype chain correct when targeting ES5-era output.
    Object.setPrototypeOf(this, PdfLoadError.prototype);
  }
}

/** The successful result of {@link openPdf}. */
export interface LoadedPdf {
  /** The live PDF.js document proxy (source for pages and rendering). */
  readonly document: PDFDocumentProxy;
  /** Number of pages in the document. */
  readonly pageCount: number;
  /** Identity of the loaded PDF (fingerprint, page count, title). */
  readonly fingerprint: PdfFingerprint;
  /**
   * Canvas-space placement of every page, laid out in a single vertical column
   * with a constant gap (Req 1.2). Reports intrinsic page dimensions so a
   * placeholder can be sized before the bitmap is ready (Req 1.3).
   */
  readonly placements: PagePlacement[];
}

/**
 * Coerce the open-PDF input to the no-network form PDF.js accepts. A `File`/
 * `Blob` is read into an `ArrayBuffer` in-browser; an `ArrayBuffer` is passed
 * through. Either way `getDocument` receives raw bytes via `data` and never a
 * URL, so no network request is made (Req 1.4).
 */
async function toPdfData(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  // File extends Blob; `arrayBuffer()` reads the local bytes with no network.
  return input.arrayBuffer();
}

/**
 * Open a PDF locally and compute everything the Canvas needs to place its pages.
 *
 * No network: the bytes are read in the browser and handed to PDF.js as `data`
 * (Req 1.4). On success the returned {@link LoadedPdf} carries the document,
 * page count, fingerprint (via {@link extractFingerprint}), and the vertical
 * column layout (via {@link layoutColumn}). Intrinsic page sizes are taken from
 * each page's scale-1 viewport.
 *
 * On any failure — invalid/corrupt PDF, password-protected, worker error — the
 * promise rejects with a {@link PdfLoadError} naming the failure (Req 1.5); the
 * caller keeps the prior state. The partially-opened document, if any, is
 * destroyed before rejecting so no worker resources leak.
 *
 * @param input  A picked `File`, a dropped `Blob`, or raw `ArrayBuffer` bytes.
 * @param gap    Column gap in canvas units (default {@link PAGE_GAP}).
 */
export async function openPdf(
  input: File | Blob | ArrayBuffer,
  gap: number = PAGE_GAP,
): Promise<LoadedPdf> {
  // Ensure the bundled, same-origin worker is installed before loading.
  configurePdfWorker();

  let data: ArrayBuffer;
  try {
    data = await toPdfData(input);
  } catch (cause) {
    throw new PdfLoadError('Could not read the selected file.', cause);
  }

  let document: PDFDocumentProxy;
  try {
    document = await getDocument({ data }).promise;
  } catch (cause) {
    throw new PdfLoadError(describeLoadFailure(cause), cause);
  }

  try {
    const pageCount = document.numPages;
    const fingerprint = await extractFingerprint(document);

    // Collect each page's intrinsic (scale-1) size for the column layout.
    const sizes: PageSize[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      // PDF.js page numbers are 1-based.
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      sizes.push({ width: viewport.width, height: viewport.height });
    }

    const placements = layoutColumn(sizes, gap);

    return { document, pageCount, fingerprint, placements };
  } catch (cause) {
    // A failure *after* the document opened (e.g. a corrupt page): tear down the
    // document so the worker frees resources, then surface a named error.
    try {
      await document.destroy();
    } catch {
      // Best-effort cleanup; ignore secondary teardown errors.
    }
    throw new PdfLoadError('The PDF opened but a page could not be read.', cause);
  }
}

/**
 * Map a raw PDF.js load error to a human-readable, named failure message
 * (Req 1.5). PDF.js errors carry a `name` such as `InvalidPDFException`,
 * `PasswordException`, or `MissingPDFException`.
 */
function describeLoadFailure(cause: unknown): string {
  const name = (cause as { name?: unknown } | null)?.name;
  switch (name) {
    case 'InvalidPDFException':
      return 'The selected file is not a valid PDF.';
    case 'PasswordException':
      return 'The PDF is password protected and cannot be opened.';
    case 'MissingPDFException':
      return 'The PDF file could not be found or is empty.';
    default:
      return 'The selected file could not be opened as a PDF.';
  }
}

/** A rendered page bitmap plus the scale it was rendered at. */
export interface RenderedPage {
  /** The page's bitmap. An `OffscreenCanvas` where available, else a canvas. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** The device-space width of the bitmap, in pixels. */
  readonly width: number;
  /** The device-space height of the bitmap, in pixels. */
  readonly height: number;
  /** The render scale actually used (after the Safari area clamp). */
  readonly scale: number;
}

/**
 * How a page's intrinsic size is reported so a placeholder can be sized before
 * any bitmap exists (Req 1.3). Derived from the scale-1 viewport.
 */
export interface PageDimensions {
  /** Intrinsic page width in PDF points (scale 1). */
  readonly width: number;
  /** Intrinsic page height in PDF points (scale 1). */
  readonly height: number;
}

/** Factory for the render target; injectable so the renderer is testable. */
export type CanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement | OffscreenCanvas;

/**
 * Default canvas factory: an `HTMLCanvasElement` in a DOM environment, falling
 * back to `OffscreenCanvas` when there is no `document` (e.g. a worker).
 */
const defaultCanvasFactory: CanvasFactory = (width, height) => {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
};

/**
 * Per-document page renderer: renders pages to bitmaps at a zoom-matched,
 * area-clamped scale (Req 1.6, 15.5), caches rendered bitmaps, releases
 * off-screen bitmaps (Req 1.7), and debounces re-render until zoom settles
 * (Req 1.6). Create one per open document and `dispose()` it when the document
 * closes.
 */
export class PdfPageRenderer {
  private readonly document: PDFDocumentProxy;
  private readonly makeCanvas: CanvasFactory;

  /** Cached page proxies, keyed by zero-based page index. */
  private readonly pages = new Map<number, Promise<PDFPageProxy>>();
  /** Currently-held bitmaps, keyed by zero-based page index (Req 1.7). */
  private readonly bitmaps = new Map<number, RenderedPage>();
  /** In-flight render tasks so a re-render can cancel the previous one. */
  private readonly renderTasks = new Map<number, RenderTask>();

  /** Debounced trailing-edge re-render trigger (Req 1.6). */
  private readonly debouncedRerender: ReturnType<typeof debounce<[number[], number]>>;

  /**
   * @param document The loaded PDF.js document.
   * @param options  Optional injectable canvas factory and timer functions
   *                 (for tests), and a custom zoom-settle delay.
   */
  constructor(
    document: PDFDocumentProxy,
    options: {
      canvasFactory?: CanvasFactory;
      timers?: TimerFns;
      settleMs?: number;
    } = {},
  ) {
    this.document = document;
    this.makeCanvas = options.canvasFactory ?? defaultCanvasFactory;
    this.debouncedRerender = debounce<[number[], number]>(
      (pageIndices, scale) => {
        void this.rerenderVisible(pageIndices, scale);
      },
      options.settleMs ?? ZOOM_SETTLE_MS,
      options.timers,
    );
  }

  /** Lazily fetch and cache a page proxy by zero-based index. */
  private getPage(pageIndex: number): Promise<PDFPageProxy> {
    let page = this.pages.get(pageIndex);
    if (!page) {
      // PDF.js page numbers are 1-based.
      page = this.document.getPage(pageIndex + 1);
      this.pages.set(pageIndex, page);
    }
    return page;
  }

  /**
   * The intrinsic (scale-1) dimensions of a page, so a placeholder can be sized
   * before the bitmap is ready (Req 1.3).
   */
  async getPageDimensions(pageIndex: number): Promise<PageDimensions> {
    const page = await this.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  /**
   * Render one page to a bitmap at `scale`, clamped so the bitmap area stays
   * within the Safari canvas-area limit (Req 1.6, 15.5). A render already in
   * flight for the same page is cancelled first (last request wins). The result
   * is cached and returned; the held bitmap can later be freed with
   * {@link releasePage} (Req 1.7).
   *
   * @param pageIndex Zero-based page index.
   * @param scale     Requested render scale (typically the Camera zoom).
   */
  async renderPage(pageIndex: number, scale: number): Promise<RenderedPage> {
    const page = await this.getPage(pageIndex);

    // Clamp the scale to the Safari area limit using the page's scaled size.
    const base = page.getViewport({ scale: 1 });
    const safeScale = clampRenderScale(base.width, base.height, scale);
    if (safeScale <= 0) {
      throw new PdfLoadError(
        `Page ${pageIndex + 1} has an invalid render scale (${scale}).`,
      );
    }

    const viewport = page.getViewport({ scale: safeScale });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    // Cancel any in-flight render for this page before starting a new one.
    this.cancelRender(pageIndex);

    const canvas = this.makeCanvas(width, height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!context) {
      throw new PdfLoadError(`Could not acquire a 2D context for page ${pageIndex + 1}.`);
    }

    const task = page.render({
      // PDF.js accepts either a 2D context type here.
      canvasContext: context as CanvasRenderingContext2D,
      viewport,
    });
    this.renderTasks.set(pageIndex, task);

    try {
      await task.promise;
    } catch (cause) {
      // A cancelled render is expected when a newer render superseded this one.
      if ((cause as { name?: string } | null)?.name === 'RenderingCancelledException') {
        throw cause;
      }
      throw new PdfLoadError(`Page ${pageIndex + 1} failed to render.`, cause);
    } finally {
      if (this.renderTasks.get(pageIndex) === task) {
        this.renderTasks.delete(pageIndex);
      }
    }

    const rendered: RenderedPage = { canvas, width, height, scale: safeScale };
    this.bitmaps.set(pageIndex, rendered);
    return rendered;
  }

  /** The currently-held bitmap for a page, if one has been rendered. */
  getBitmap(pageIndex: number): RenderedPage | undefined {
    return this.bitmaps.get(pageIndex);
  }

  /**
   * Release the rendered bitmap of an off-screen page (Req 1.7): cancel any
   * in-flight render, drop the cached bitmap, and shrink its canvas to 0x0 so
   * the browser can reclaim the backing store immediately.
   */
  releasePage(pageIndex: number): void {
    this.cancelRender(pageIndex);
    const rendered = this.bitmaps.get(pageIndex);
    if (rendered) {
      // Zeroing the dimensions frees the (potentially large) bitmap memory.
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
      this.bitmaps.delete(pageIndex);
    }
  }

  /**
   * Release every page that is NOT in `keep` (Req 1.7). The PageLayer calls
   * this with the set of currently-visible page indices (plus a margin) so
   * off-screen bitmaps are freed as the viewport moves.
   */
  releaseAllExcept(keep: Iterable<number>): void {
    const keepSet = new Set(keep);
    for (const pageIndex of [...this.bitmaps.keys()]) {
      if (!keepSet.has(pageIndex)) {
        this.releasePage(pageIndex);
      }
    }
  }

  /**
   * Schedule a re-render of the visible pages to a new zoom, firing only after
   * the zoom has settled (~500 ms of quiet, Req 1.6). Call this on every zoom
   * change; continuous zooming defers the work until it stops. The Camera-event
   * wiring is task 13/15.
   *
   * @param visiblePageIndices The pages currently in view.
   * @param scale              The new (settled) render scale / zoom.
   */
  scheduleRerender(visiblePageIndices: number[], scale: number): void {
    this.debouncedRerender(visiblePageIndices, scale);
  }

  /** Re-render the given visible pages at `scale` (the settled-zoom target). */
  private async rerenderVisible(pageIndices: number[], scale: number): Promise<void> {
    await Promise.all(
      pageIndices.map((pageIndex) =>
        this.renderPage(pageIndex, scale).catch((error) => {
          // A superseded render cancels cleanly; swallow that, surface the rest
          // to the console for the PageLayer/host to decide how to react.
          if ((error as { name?: string } | null)?.name !== 'RenderingCancelledException') {
            // eslint-disable-next-line no-console
            console.error(error);
          }
        }),
      ),
    );
  }

  /** Cancel an in-flight render task for a page, if any. */
  private cancelRender(pageIndex: number): void {
    const task = this.renderTasks.get(pageIndex);
    if (task) {
      task.cancel();
      this.renderTasks.delete(pageIndex);
    }
  }

  /**
   * Cancel pending work and release all bitmaps. Call when the document closes.
   * Does not destroy the underlying document — the owner of {@link LoadedPdf}
   * does that.
   */
  dispose(): void {
    this.debouncedRerender.cancel();
    for (const task of this.renderTasks.values()) {
      task.cancel();
    }
    this.renderTasks.clear();
    for (const pageIndex of [...this.bitmaps.keys()]) {
      this.releasePage(pageIndex);
    }
    this.pages.clear();
  }
}
