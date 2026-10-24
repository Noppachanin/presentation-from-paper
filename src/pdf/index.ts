/**
 * PDF service barrel.
 *
 * The PDF_Loader (local open + fingerprint + column layout), per-page renderer
 * (zoom-matched, area-clamped bitmaps with off-screen release), the render-scale
 * clamp, the fingerprint helpers, and the worker wiring. Import from `../pdf`
 * (or `@/pdf`) rather than the individual files so the module layout can change
 * without touching call sites.
 */

export { configurePdfWorker } from './pdfWorker';
export { clampRenderScale, SAFARI_MAX_CANVAS_AREA } from './renderScale';
export { extractFingerprint, compareFingerprint } from './fingerprint';
export type { FingerprintComparison } from './fingerprint';
export { layoutColumn, PAGE_GAP } from './columnLayout';
export type { PageSize } from './columnLayout';
export { debounce, ZOOM_SETTLE_MS } from './debounce';
export type { Debounced, TimerFns } from './debounce';
export { openPdf, PdfLoadError, PdfPageRenderer } from './pdfLoader';
export type {
  LoadedPdf,
  RenderedPage,
  PageDimensions,
  CanvasFactory,
} from './pdfLoader';
