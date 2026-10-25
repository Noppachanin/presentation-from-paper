/**
 * PDF + presentation session orchestration (task 15.1).
 *
 * This hook owns the file flows the app shell exposes but that no single lower
 * module wires end to end:
 *
 *  - **Open PDF** (Req 1.1, 1.5): `openPdf(file)` → on success create a
 *    {@link PdfPageRenderer} for the document and `setPdf(fingerprint, placements)`
 *    on the Document store; on {@link PdfLoadError} report a named error and keep
 *    the prior state.
 *  - **Load presentation** (Req 9.5-9.9, 9.14, 10.8): parse the Presentation_File
 *    (`loadPresentationFile`), then prompt for the PDF, `openPdf`, and
 *    {@link reconcile} the stored state against the freshly loaded fingerprint.
 *    On `match` → `replaceDocument` + restore the stored initial Camera. On a
 *    mismatch → surface the status so the shell can show the MismatchDialog;
 *    `continueMismatch()` re-runs reconcile with `continueAfterMismatch` then
 *    `replaceDocument`. After any successful load, `isPresentModeRequested` on
 *    the current URL decides whether to start in Present_Mode (Req 10.8).
 *
 * The renderer and the live PDF document are kept in React state so the canvas
 * layers (PageLayer needs the renderer, ItemLayer/Crops need the document) can
 * be handed the current instances. The hook disposes the previous renderer when
 * a new PDF is opened.
 *
 * State transitions that need UI (error, mismatch, pick-the-PDF prompt) are
 * surfaced as a small discriminated `flow` the App renders dialogs from; the
 * hook never touches the DOM itself.
 */

import { useCallback, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  openPdf,
  PdfLoadError,
  PdfPageRenderer,
  type LoadedPdf,
} from '../pdf';
import {
  isPresentModeRequested,
  loadPresentationFile,
  reconcile,
  type ReconcileResult,
} from '../io';
import type { FingerprintComparison } from '../pdf/fingerprint';
import { useDocumentStore, useHistoryStore, useSessionStore } from '../state';
import type { DocumentState } from '../types';

/** A pending modal step surfaced to the App so it can render the right dialog. */
export type PdfFlow =
  | { kind: 'idle' }
  /** A named error to show (open-PDF failure, bad presentation file). */
  | { kind: 'error'; title: string; message: string }
  /** A loaded presentation is waiting for the user to pick its PDF. */
  | { kind: 'need-pdf'; stored: DocumentState }
  /** The picked PDF does not match; the user must continue or re-pick. */
  | { kind: 'mismatch'; status: Exclude<FingerprintComparison, 'match'> };

/** What {@link usePdfSession} exposes to the App. */
export interface PdfSession {
  /** The live PDF.js document (for ItemLayer crops), or null when none is open. */
  readonly pdfDocument: PDFDocumentProxy | null;
  /** The page renderer (for the PageLayer), or null when no PDF is open. */
  readonly renderer: PdfPageRenderer | null;
  /** The current modal flow the App should render a dialog for. */
  readonly flow: PdfFlow;
  /** Open a PDF file directly (the "Open PDF" entry point). */
  readonly openPdfFile: (file: File) => Promise<void>;
  /** Load a Presentation_File (the "Load presentation" entry point). */
  readonly loadPresentation: (file: File) => Promise<void>;
  /** Supply the PDF for a presentation waiting on one (the `need-pdf` flow). */
  readonly providePdfForLoad: (file: File) => Promise<void>;
  /** Continue loading after a mismatch warning (clamps/discards out-of-range). */
  readonly continueMismatch: () => void;
  /** Dismiss the current flow dialog. */
  readonly dismissFlow: () => void;
}

/**
 * Orchestrate the PDF open / presentation load / reconcile flows.
 *
 * @param onLoaded Called after a presentation or PDF finishes loading, with
 *   whether the URL requested Present_Mode (Req 10.8), so the App can switch
 *   mode and reset navigation.
 */
export function usePdfSession(onLoaded: (presentRequested: boolean) => void): PdfSession {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [renderer, setRenderer] = useState<PdfPageRenderer | null>(null);
  const [flow, setFlow] = useState<PdfFlow>({ kind: 'idle' });

  // The stored state + freshly loaded PDF held between the mismatch warning and
  // the user's continue/re-pick decision.
  const pendingRef = useRef<{ stored: DocumentState; loaded: LoadedPdf } | null>(null);

  /** Swap in a freshly loaded PDF: dispose the old renderer, install the new. */
  const installPdf = useCallback(
    (loaded: LoadedPdf): PdfPageRenderer => {
      setRenderer((prev) => {
        prev?.dispose();
        return null;
      });
      const nextRenderer = new PdfPageRenderer(loaded.document);
      setRenderer(nextRenderer);
      setPdfDocument(loaded.document);
      return nextRenderer;
    },
    [],
  );

  const presentRequested = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return isPresentModeRequested(window.location);
  }, []);

  const openPdfFile = useCallback(
    async (file: File) => {
      try {
        const loaded = await openPdf(file);
        installPdf(loaded);
        // Set the PDF fingerprint + placements; keep any authored items.
        useDocumentStore.getState().setPdf(loaded.fingerprint, loaded.placements);
        useHistoryStore.getState().clearHistory();
        setFlow({ kind: 'idle' });
        onLoaded(presentRequested());
      } catch (error) {
        // On a PdfLoadError, keep the prior Canvas state and name the failure
        // (Req 1.5). Any other error is reported the same way.
        const message =
          error instanceof PdfLoadError
            ? error.message
            : 'The selected file could not be opened as a PDF.';
        setFlow({ kind: 'error', title: 'Could not open PDF', message });
      }
    },
    [installPdf, onLoaded, presentRequested],
  );

  /** Apply a reconciled state to the stores and restore the initial Camera. */
  const applyReconciled = useCallback((result: ReconcileResult) => {
    const reconciled = result.reconciled;
    if (!reconciled) return;
    useDocumentStore.getState().replaceDocument(reconciled);
    useHistoryStore.getState().clearHistory();
    if (result.restoreInitialCamera) {
      // Restore the stored initial Camera (Req 9.9, 9.14).
      useSessionStore.getState().setCamera({ ...reconciled.initialCamera });
    }
  }, []);

  const providePdfForLoad = useCallback(
    async (file: File) => {
      const pending = pendingRef.current;
      const stored = pending?.stored ?? (flow.kind === 'need-pdf' ? flow.stored : null);
      if (!stored) {
        setFlow({ kind: 'idle' });
        return;
      }
      try {
        const loaded = await openPdf(file);
        installPdf(loaded);
        const result = reconcile(stored, loaded.fingerprint);
        if (result.status === 'match') {
          applyReconciled(result);
          pendingRef.current = null;
          setFlow({ kind: 'idle' });
          onLoaded(presentRequested());
          return;
        }
        // A mismatch: hold the pair and let the App show the warning (Req 9.6/9.7).
        pendingRef.current = { stored, loaded };
        setFlow({ kind: 'mismatch', status: result.status });
      } catch (error) {
        const message =
          error instanceof PdfLoadError
            ? error.message
            : 'The selected file could not be opened as a PDF.';
        setFlow({ kind: 'error', title: 'Could not open PDF', message });
      }
    },
    [applyReconciled, flow, installPdf, onLoaded, presentRequested],
  );

  const loadPresentation = useCallback(
    async (file: File) => {
      const result = await loadPresentationFile(file);
      if (!result.ok) {
        setFlow({
          kind: 'error',
          title: 'Could not load presentation',
          message: result.error.message,
        });
        return;
      }
      // Hold the parsed state and prompt for its PDF (Req 9.5).
      pendingRef.current = { stored: result.value, loaded: null as unknown as LoadedPdf };
      setFlow({ kind: 'need-pdf', stored: result.value });
    },
    [],
  );

  const continueMismatch = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending?.loaded) {
      setFlow({ kind: 'idle' });
      return;
    }
    // Re-run reconcile asking to continue: clamps/discards out-of-range items.
    const result = reconcile(pending.stored, pending.loaded.fingerprint, {
      continueAfterMismatch: true,
    });
    applyReconciled(result);
    pendingRef.current = null;
    setFlow({ kind: 'idle' });
    onLoaded(presentRequested());
  }, [applyReconciled, onLoaded, presentRequested]);

  const dismissFlow = useCallback(() => {
    // Re-picking a different PDF keeps the pending stored state so the user can
    // choose again from the need-pdf prompt; a plain dismiss clears everything.
    if (flow.kind === 'mismatch' && pendingRef.current) {
      setFlow({ kind: 'need-pdf', stored: pendingRef.current.stored });
      return;
    }
    pendingRef.current = null;
    setFlow({ kind: 'idle' });
  }, [flow]);

  return {
    pdfDocument,
    renderer,
    flow,
    openPdfFile,
    loadPresentation,
    providePdfForLoad,
    continueMismatch,
    dismissFlow,
  };
}
