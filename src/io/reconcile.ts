/**
 * Load-time PDF_Fingerprint reconciliation (design "io", task 8.6).
 *
 * After a Presentation_File is parsed into a {@link DocumentState} (see
 * {@link ./fileIo}) and the user re-opens the PDF locally, the Application must
 * decide whether the stored presentation matches the selected PDF and, if not,
 * how to reconcile the mismatch (Req 9.5-9.9, 9.14).
 *
 * Everything here is PURE: {@link reconcile} takes the already-parsed stored
 * DocumentState plus the {@link PdfFingerprint} extracted from the freshly
 * loaded PDF (extraction lives in the PDF service, task 4.7) and returns a
 * discriminated {@link ReconcileResult}. It never loads a PDF, touches the DOM,
 * or builds a dialog (dialogs are task 14.1); the app shell interprets the
 * result and shows the continue / choose-different warnings.
 *
 * Reconciliation rules:
 * - `'match'`: fingerprint and page count agree (Req 9.9). The presentation
 *   loads as-is; the result flags that Crops must be re-rendered from the PDF
 *   and the stored initial Camera restored. No clamping/discarding happens.
 * - `'fingerprint-mismatch'` / `'page-count-mismatch'`: the app shows a warning
 *   (Req 9.6, 9.7). The caller decides to continue or pick a different PDF; on
 *   CONTINUE it uses {@link reconcileOnContinue} (or passes `continueAfterMismatch`)
 *   to clamp or discard out-of-range Focus_Areas and Crops (Req 9.8).
 */

import { clampRectWithin, type Rect } from '../geometry';
import { compareFingerprint, type FingerprintComparison } from '../pdf/fingerprint';
import type {
  Crop,
  DocumentState,
  FocusArea,
  PagePlacement,
  PdfFingerprint,
  RectPage,
} from '../types';

/**
 * The outcome of reconciling a stored {@link DocumentState} against a freshly
 * loaded PDF's {@link PdfFingerprint}.
 *
 * - On `'match'`, `reconciled` is the stored state (unchanged), `needsCropRerender`
 *   is true (Req 9.9), and `restoreInitialCamera` is true (Req 9.9, 9.14).
 * - On a mismatch, `reconciled` is present ONLY when the caller asked to
 *   continue after the warning (so the shell can defer the choice). When the
 *   caller has not yet continued, `reconciled` is undefined and the shell must
 *   show the warning and re-invoke with `continueAfterMismatch: true`.
 */
export interface ReconcileResult {
  /** Which comparison outcome drove this result (Req 9.6, 9.7, 9.9). */
  status: FingerprintComparison;
  /**
   * The state to load. Present on `'match'` and on a mismatch when the caller
   * chose to continue; undefined on a mismatch awaiting the user's choice.
   */
  reconciled?: DocumentState;
  /** True on `'match'`: Crops must be re-rendered from the PDF (Req 9.9). */
  needsCropRerender: boolean;
  /** True on `'match'`: restore the stored initial Camera (Req 9.9, 9.14). */
  restoreInitialCamera: boolean;
  /**
   * Ids of Focus_Areas discarded because their page index was out of range.
   * Empty on `'match'` or when nothing was discarded.
   */
  discardedFocusAreaIds: string[];
  /**
   * Ids of Crops discarded because their source page index was out of range.
   * Empty on `'match'` or when nothing was discarded.
   */
  discardedCropIds: string[];
}

/** Options controlling how {@link reconcile} handles a mismatch. */
export interface ReconcileOptions {
  /**
   * When true AND the comparison is a mismatch, reconcile the state now by
   * clamping/discarding out-of-range Focus_Areas and Crops (Req 9.8) and return
   * it in `reconciled`. When false (the default), a mismatch returns no
   * `reconciled` state so the caller can show the warning first.
   */
  continueAfterMismatch?: boolean;
}

/**
 * Reconcile a stored presentation against a freshly loaded PDF (Req 9.6-9.9).
 *
 * The decision uses the PURE {@link compareFingerprint} from the PDF service.
 * On `'match'` the stored state loads unchanged, with flags to re-render Crops
 * and restore the initial Camera (Req 9.9, 9.14). On a mismatch the result
 * carries the status so the shell can warn (Req 9.6, 9.7); it only produces a
 * reconciled state when `options.continueAfterMismatch` is set (Req 9.8).
 *
 * @param stored The DocumentState parsed from the Presentation_File.
 * @param loaded The PdfFingerprint extracted from the re-opened PDF.
 * @param options Mismatch-handling options.
 * @returns The discriminated reconcile result.
 */
export function reconcile(
  stored: DocumentState,
  loaded: PdfFingerprint,
  options: ReconcileOptions = {},
): ReconcileResult {
  const status = compareFingerprint(stored.pdf, loaded);

  if (status === 'match') {
    return {
      status,
      reconciled: stored,
      needsCropRerender: true,
      restoreInitialCamera: true,
      discardedFocusAreaIds: [],
      discardedCropIds: [],
    };
  }

  // A mismatch: only reconcile when the caller has chosen to continue.
  if (!options.continueAfterMismatch) {
    return {
      status,
      needsCropRerender: false,
      restoreInitialCamera: false,
      discardedFocusAreaIds: [],
      discardedCropIds: [],
    };
  }

  const clamped = reconcileOnContinue(stored, loaded);
  return {
    status,
    reconciled: clamped.state,
    needsCropRerender: false,
    restoreInitialCamera: false,
    discardedFocusAreaIds: clamped.discardedFocusAreaIds,
    discardedCropIds: clamped.discardedCropIds,
  };
}

/** The result of clamping/discarding out-of-range items on continue. */
export interface ContinueReconciliation {
  /** The reconciled DocumentState with out-of-range items clamped or removed. */
  state: DocumentState;
  /** Ids of Focus_Areas removed because their page index was out of range. */
  discardedFocusAreaIds: string[];
  /** Ids of Crops removed because their source page index was out of range. */
  discardedCropIds: string[];
}

/**
 * Reconcile a stored state against a loaded PDF when the user continues after a
 * mismatch warning (Req 9.8). A Focus_Area or Crop is DISCARDED when its page
 * index is `>= loaded.pageCount` (the page no longer exists). Otherwise its
 * Page-coordinate rectangle is CLAMPED to that page's bounds with
 * {@link clampRectWithin} so it stays on the paper.
 *
 * Page bounds come from the stored {@link PagePlacement} for that page index
 * (intrinsic `pageWidth`/`pageHeight`). When no placement is stored for a page
 * that is still in range, the item is kept unchanged (there is nothing to clamp
 * against). Any Connector that referenced a discarded item is removed so no
 * dangling reference survives.
 *
 * This is PURE: it returns a new DocumentState and never mutates `stored`.
 *
 * @param stored The parsed DocumentState.
 * @param loaded The loaded PDF's fingerprint (its `pageCount` bounds the pages).
 * @returns The clamped/filtered state plus the ids of discarded items.
 */
export function reconcileOnContinue(
  stored: DocumentState,
  loaded: PdfFingerprint,
): ContinueReconciliation {
  const pageCount = loaded.pageCount;
  const boundsByPage = pageBoundsByIndex(stored.pages);

  const discardedFocusAreaIds: string[] = [];
  const focusAreas: FocusArea[] = [];
  for (const area of stored.focusAreas) {
    if (!isPageInRange(area.pageIndex, pageCount)) {
      discardedFocusAreaIds.push(area.id);
      continue;
    }
    focusAreas.push(clampFocusArea(area, boundsByPage.get(area.pageIndex)));
  }

  const discardedCropIds: string[] = [];
  const crops: Crop[] = [];
  for (const crop of stored.crops) {
    if (!isPageInRange(crop.sourcePageIndex, pageCount)) {
      discardedCropIds.push(crop.id);
      continue;
    }
    crops.push(clampCrop(crop, boundsByPage.get(crop.sourcePageIndex)));
  }

  // Drop Connectors and Steps that referenced a discarded item so the loaded
  // state carries no dangling references (keeps the Sequence consistent).
  const discardedIds = new Set<string>([
    ...discardedFocusAreaIds,
    ...discardedCropIds,
  ]);
  const connectors = stored.connectors.filter(
    (c) => !discardedIds.has(c.fromItemId) && !discardedIds.has(c.toTargetId),
  );
  const sequence = stored.sequence.filter((s) => !discardedIds.has(s.itemId));

  const state: DocumentState = {
    ...stored,
    focusAreas,
    crops,
    connectors,
    sequence,
  };

  return { state, discardedFocusAreaIds, discardedCropIds };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A page index is in range when it is a valid index into `[0, pageCount)`. */
function isPageInRange(pageIndex: number, pageCount: number): boolean {
  return Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < pageCount;
}

/**
 * Build a map from page index to that page's intrinsic Page-coordinate bounds
 * (origin at 0,0 with the page's width/height). Used to clamp Page-coordinate
 * rectangles of Focus_Areas and Crops.
 */
function pageBoundsByIndex(pages: PagePlacement[]): Map<number, Rect> {
  const map = new Map<number, Rect>();
  for (const p of pages) {
    map.set(p.pageIndex, {
      x: 0,
      y: 0,
      width: p.pageWidth,
      height: p.pageHeight,
    });
  }
  return map;
}

/**
 * Clamp a Focus_Area's Page-coordinate rect to its page bounds. When no bounds
 * are known for the page, the area is returned unchanged (nothing to clamp to).
 */
function clampFocusArea(area: FocusArea, bounds: Rect | undefined): FocusArea {
  if (!bounds) return area;
  return { ...area, rect: clampRectWithin(area.rect as RectPage, bounds) };
}

/**
 * Clamp a Crop's Page-coordinate source rect to its source page bounds. When no
 * bounds are known for the page, the crop is returned unchanged.
 */
function clampCrop(crop: Crop, bounds: Rect | undefined): Crop {
  if (!bounds) return crop;
  return { ...crop, sourceRect: clampRectWithin(crop.sourceRect as RectPage, bounds) };
}
