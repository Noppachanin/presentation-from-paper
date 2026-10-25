/**
 * Application shell (task 15.1).
 *
 * Composes every implemented module into the runnable app:
 *
 *  - A full-viewport surface that stacks, bottom to top, the PageLayer,
 *    ItemLayer, OverlayLayer, InkLayer, and the transparent CaptureSurface the
 *    Input_Router attaches to.
 *  - The editor chrome (Toolbar + SequencePanel) in Edit_Mode; the Present_Mode
 *    chrome (InkPalette + StepIndicator + FullscreenButton) in Present_Mode; and
 *    the StartScreen before any PDF is open.
 *  - A ResizeObserver tracking the surface size, fed to the layers and toolbar.
 *  - Mode switching, keyboard shortcuts, the rAF Camera transition loop,
 *    reduce-motion handling, free pan/zoom, Step navigation, ink, and the
 *    unsaved-changes guard — each in a focused hook (see the `use*` files).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptureSurface,
  InkLayer,
  ItemLayer,
  OverlayLayer,
  PageLayer,
  type HoverCursor,
} from '../canvas';
import {
  DEFAULT_INK_COLOR,
  DEFAULT_INK_WIDTH,
  ErrorDialog,
  FullscreenButton,
  InkPalette,
  LoadPresentationDialog,
  MismatchDialog,
  SequencePanel,
  StartScreen,
  StepIndicator,
  Toolbar,
  type StepIndicatorHandle,
} from '../ui';
import { HomeScreenHint, useVisualViewport } from '../pwa';
import { requestFullscreen } from '../ui';
import { useDocumentStore, useHistoryStore, useSessionStore } from '../state';
import '../pwa/pwa.css';
import {
  cameraForStep,
  clampStepIndex,
  nextStepIndex,
  prevStepIndex,
} from '../sequence';
import { strokesAfterStepChange } from '../ink';
import { cameraForTarget } from '../camera';
import { savePresentation } from '../io';
import { currentPageIndex } from '../ui';
import type { InkStroke, Viewport } from '../types';
import { useCameraTransitions } from './useCameraTransitions';
import { useKeyboard } from './useKeyboard';
import { usePdfSession } from './usePdfSession';
import { useUnsavedGuard } from './useUnsavedGuard';
import { useGestureWiring } from './useGestureWiring';

/** Read the OS `prefers-reduced-motion` setting (Req 7.7, 14.25). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export function App() {
  // --- Stores ------------------------------------------------------------
  const mode = useSessionStore((s) => s.mode);
  const setMode = useSessionStore((s) => s.setMode);
  const camera = useSessionStore((s) => s.camera);
  const currentStepIndex = useSessionStore((s) => s.currentStepIndex);
  const setCurrentStepIndex = useSessionStore((s) => s.setCurrentStepIndex);
  const discussionInk = useSessionStore((s) => s.discussionInk);
  const sessionReduceMotion = useSessionStore((s) => s.reduceMotion);

  const pdf = useDocumentStore((s) => s.pdf);
  const pages = useDocumentStore((s) => s.pages);
  const focusAreas = useDocumentStore((s) => s.focusAreas);
  const notes = useDocumentStore((s) => s.notes);
  const images = useDocumentStore((s) => s.images);
  const crops = useDocumentStore((s) => s.crops);
  const connectors = useDocumentStore((s) => s.connectors);
  const sequence = useDocumentStore((s) => s.sequence);
  const keptInk = useDocumentStore((s) => s.keptInk);

  const hasPdf = pdf.pageCount > 0;
  const canPresent = sequence.length > 0;

  // --- Viewport tracking (ResizeObserver) --------------------------------
  const surfaceWrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 1, height: 1 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const getViewport = useCallback(() => viewportRef.current, []);

  // The visible viewport (Req 15.8): in Present_Mode the Canvas fills the whole
  // viewport, so size it to `visualViewport` rather than the layout viewport so
  // the collapsing Safari toolbar/address bar never leaves the Canvas or the
  // Ink_Palette mis-sized. Updates on visualViewport 'resize'/'scroll'.
  const visualViewport = useVisualViewport();
  const presenting = mode === 'present';

  useEffect(() => {
    const el = surfaceWrapRef.current;
    if (!el) return;
    const measure = () => {
      // When presenting, the surface spans the whole visible viewport.
      if (presenting) {
        setViewport({
          width: Math.max(1, visualViewport.width),
          height: Math.max(1, visualViewport.height),
        });
        return;
      }
      const rect = el.getBoundingClientRect();
      setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [presenting, visualViewport.width, visualViewport.height]);

  // --- Camera transitions (rAF loop) -------------------------------------
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotion = sessionReduceMotion || prefersReducedMotion;
  const transitions = useCameraTransitions(getViewport, reduceMotion);

  // --- In-progress ink stroke (local, repaints only the InkLayer) --------
  const [inProgressStroke, setInProgressStroke] = useState<InkStroke | null>(null);
  const [hoverCursor] = useState<HoverCursor | null>(null);

  // --- Ink palette selection ---------------------------------------------
  const [inkColor, setInkColor] = useState<string>(DEFAULT_INK_COLOR);
  const [inkWidth, setInkWidth] = useState<number>(DEFAULT_INK_WIDTH);
  const inkColorRef = useRef(inkColor);
  inkColorRef.current = inkColor;
  const inkWidthRef = useRef(inkWidth);
  inkWidthRef.current = inkWidth;

  // --- Step indicator activity -------------------------------------------
  const stepIndicatorRef = useRef<StepIndicatorHandle | null>(null);
  const [activity, setActivity] = useState(0);
  const pokeActivity = useCallback(() => setActivity((n) => n + 1), []);

  // --- Navigation: advance a Step and animate the Camera (Req 8.2/8.3) ---
  const animateToStepIndex = useCallback(
    (index: number) => {
      const doc = useDocumentStore.getState();
      const step = doc.sequence[index];
      if (!step) return;
      const target = cameraForStep(doc, step, viewportRef.current);
      if (target) {
        transitions.animateTo(target);
      }
    },
    [transitions],
  );

  /**
   * Apply the Ink_Clear_Policy on a Step change (Req 14.21/14.25): clear-on-
   * step-change drops Discussion_Ink and keeps Kept_Ink; other policies leave
   * ink untouched. Kept_Ink is persisted and always exempt.
   */
  const applyStepChangeInkPolicy = useCallback(() => {
    const policy = useSessionStore.getState().inkClearPolicy;
    useSessionStore.setState((s) => ({
      discussionInk: strokesAfterStepChange(policy, s.discussionInk),
    }));
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const length = useDocumentStore.getState().sequence.length;
      const clamped = clampStepIndex(index, length);
      setCurrentStepIndex(clamped);
      applyStepChangeInkPolicy();
      animateToStepIndex(clamped);
      pokeActivity();
    },
    [animateToStepIndex, applyStepChangeInkPolicy, pokeActivity, setCurrentStepIndex],
  );

  const onNext = useCallback(() => {
    const length = useDocumentStore.getState().sequence.length;
    const next = nextStepIndex(useSessionStore.getState().currentStepIndex, length);
    goToStep(next);
  }, [goToStep]);

  const onPrev = useCallback(() => {
    const length = useDocumentStore.getState().sequence.length;
    const prev = prevStepIndex(useSessionStore.getState().currentStepIndex, length);
    goToStep(prev);
  }, [goToStep]);

  // --- Mode switching -----------------------------------------------------
  const enterPresent = useCallback(() => {
    const doc = useDocumentStore.getState();
    if (doc.sequence.length === 0) return; // disabled with no Steps (Req 8.7)
    setMode('present');
    // Animate to the FIRST Step on entering Present_Mode (Req 8.1).
    setCurrentStepIndex(0);
    const first = doc.sequence[0];
    const target = first ? cameraForStep(doc, first, viewportRef.current) : undefined;
    if (target) transitions.animateTo(target);
    pokeActivity();
  }, [pokeActivity, setCurrentStepIndex, setMode, transitions]);

  const exitPresent = useCallback(() => {
    // Return to Edit_Mode keeping the current Camera (Req 8.4): just switch mode
    // and cancel any running transition so the Camera stays put.
    transitions.cancel();
    setMode('edit');
  }, [setMode, transitions]);

  // --- Fit page width (Req 2.5) ------------------------------------------
  const fitPageWidth = useCallback(() => {
    const doc = useDocumentStore.getState();
    const cam = useSessionStore.getState().camera;
    const idx = currentPageIndex(cam, viewportRef.current, doc.pages);
    const placement = idx === undefined ? doc.pages[0] : doc.pages.find((p) => p.pageIndex === idx);
    if (!placement) return;
    // Fit the full page rect to the viewport (cameraForTarget adds a margin).
    const target = cameraForTarget(placement.rect, viewportRef.current);
    transitions.animateTo(target);
  }, [transitions]);

  // --- File flows ---------------------------------------------------------
  const onSessionLoaded = useCallback(
    (presentRequested: boolean) => {
      setCurrentStepIndex(0);
      if (presentRequested) {
        // Defer so the just-loaded sequence/pages are in the store.
        setTimeout(() => enterPresent(), 0);
      }
    },
    [enterPresent, setCurrentStepIndex],
  );

  const session = usePdfSession(onSessionLoaded);
  const { confirmDiscardIfDirty } = useUnsavedGuard();

  const [loadDialogOpen, setLoadDialogOpen] = useState(false);

  const handleOpenPdf = useCallback(
    (file: File) => {
      void session.openPdfFile(file);
    },
    [session],
  );

  const handleLoadPresentation = useCallback(
    (file: File) => {
      // Guard against discarding unsaved edits before loading (Req 9.12).
      if (!confirmDiscardIfDirty()) return;
      setLoadDialogOpen(false);
      void session.loadPresentation(file);
    },
    [confirmDiscardIfDirty, session],
  );

  const handleSave = useCallback(() => {
    savePresentation(useDocumentStore.getState());
    // A save makes the session clean (Req 9.12).
    useSessionStore.getState().setDirty(false);
  }, []);

  // --- Keyboard -----------------------------------------------------------
  useKeyboard({
    mode,
    onNext,
    onPrev,
    onExitPresent: exitPresent,
    onActivity: pokeActivity,
  });

  // --- Gesture wiring -----------------------------------------------------
  const [surfaceEl, setSurfaceEl] = useState<HTMLElement | null>(null);
  useGestureWiring({
    surface: surfaceEl,
    getViewport,
    getInkColor: useCallback(() => inkColorRef.current, []),
    getInkWidth: useCallback(() => inkWidthRef.current, []),
    setInProgress: setInProgressStroke,
    onNav: useCallback(
      (direction: 'next' | 'prev') => (direction === 'next' ? onNext() : onPrev()),
      [onNext, onPrev],
    ),
    onActivity: pokeActivity,
    onCameraGrabbed: transitions.cancel,
  });

  // Clear the transient in-progress stroke if we leave a drawing context.
  useEffect(() => {
    if (!hasPdf) setInProgressStroke(null);
  }, [hasPdf]);

  // --- Clear ink (Present_Mode palette) ----------------------------------
  const clearAllInk = useCallback(() => {
    // Clear Kept_Ink as one undo unit AND drop transient Discussion_Ink.
    useHistoryStore.getState().recordEdit('clear ink', (draft) => {
      draft.keptInk = [];
    });
    useSessionStore.setState({ discussionInk: [] });
  }, []);

  const overlayDoc = useMemo(
    () => ({ pages, focusAreas, notes, images, crops, connectors, sequence }),
    [pages, focusAreas, notes, images, crops, connectors, sequence],
  );

  // --- Fullscreen + Fullscreen_Fallback (Req 8.9, 8.13) ------------------
  // Request standard/WebKit fullscreen; when it resolves false (API
  // unavailable or rejected — e.g. iPhone Safari), activate the
  // Fullscreen_Fallback: the app already fills the viewport, and we show the
  // dismissible add-to-Home-Screen hint (suppressed when already standalone).
  const [showHomeScreenHint, setShowHomeScreenHint] = useState(false);
  const handleFullscreen = useCallback(() => {
    void requestFullscreen().then((entered) => {
      if (!entered) setShowHomeScreenHint(true);
    });
  }, []);

  // Drop the hint when leaving Present_Mode so re-entering starts clean.
  useEffect(() => {
    if (!presenting) setShowHomeScreenHint(false);
  }, [presenting]);

  return (
    <div
      className="app"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#e5e7eb',
      }}
    >
      {/* Toolbar (Edit_Mode only). The wrapper applies the top safe-area inset
          so the top chrome sits inside the notch/status-bar in
          Home_Screen_Mode (Req 15.7). */}
      {hasPdf && !presenting && (
        <div className="app-toolbar-safe-area">
        <Toolbar
          viewport={viewport}
          onFitPageWidth={fitPageWidth}
          onPresent={enterPresent}
          onOpenPdf={() => {
            /* re-open uses the start-screen controls or OS picker via toolbar */
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/pdf,.pdf';
            input.onchange = () => {
              const f = input.files?.[0];
              if (f) handleOpenPdf(f);
            };
            input.click();
          }}
          onLoadPresentation={() => setLoadDialogOpen(true)}
          onSave={handleSave}
          canPresent={canPresent}
        />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* The layered canvas surface */}
        <div
          ref={surfaceWrapRef}
          className="surface"
          style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          {hasPdf ? (
            <>
              <PageLayer
                placements={pages}
                camera={camera}
                viewport={viewport}
                renderer={session.renderer}
              />
              <ItemLayer
                notes={notes}
                images={images}
                crops={crops}
                camera={camera}
                pdfDocument={session.pdfDocument}
              />
              <OverlayLayer
                doc={overlayDoc}
                camera={camera}
                viewport={viewport}
                mode={mode}
                currentStepIndex={currentStepIndex}
              />
              <InkLayer
                keptInk={keptInk}
                discussionInk={discussionInk}
                camera={camera}
                viewport={viewport}
                inProgressStroke={inProgressStroke}
                hoverCursor={hoverCursor}
              />
              <CaptureSurface onSurfaceReady={setSurfaceEl} />

              {/* Present_Mode chrome */}
              {presenting && (
                <>
                  <StepIndicator ref={stepIndicatorRef} activitySignal={activity} />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                      right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
                      zIndex: 40,
                    }}
                  >
                    <FullscreenButton onFullscreen={handleFullscreen} />
                  </div>
                  <InkPalette
                    color={inkColor}
                    onColorChange={setInkColor}
                    width={inkWidth}
                    onWidthChange={setInkWidth}
                    onClearInk={clearAllInk}
                  />
                  {/* Fullscreen_Fallback add-to-Home-Screen hint (Req 8.13). */}
                  <HomeScreenHint
                    open={showHomeScreenHint}
                    onDismiss={() => setShowHomeScreenHint(false)}
                  />
                </>
              )}
            </>
          ) : (
            <StartScreen onOpenPdf={handleOpenPdf} onLoadPresentation={handleLoadPresentation} />
          )}
        </div>

        {/* Sequence side panel (Edit_Mode only) */}
        {hasPdf && !presenting && <SequencePanel onStepClick={goToStep} />}
      </div>

      {/* --- Dialogs driven by the PDF session flow --- */}
      <LoadPresentationDialog
        open={loadDialogOpen}
        onLoadPresentation={handleLoadPresentation}
        onClose={() => setLoadDialogOpen(false)}
      />
      <ErrorDialog
        open={session.flow.kind === 'error'}
        title={session.flow.kind === 'error' ? session.flow.title : undefined}
        message={session.flow.kind === 'error' ? session.flow.message : ''}
        onClose={session.dismissFlow}
      />
      {/* "Load presentation → pick its PDF" prompt */}
      {session.flow.kind === 'need-pdf' && (
        <NeedPdfDialog
          onPick={(f) => void session.providePdfForLoad(f)}
          onCancel={session.dismissFlow}
        />
      )}
      {session.flow.kind === 'mismatch' && (
        <MismatchDialog
          open
          status={session.flow.status}
          onContinue={session.continueMismatch}
          onChooseDifferent={session.dismissFlow}
          onClose={session.dismissFlow}
        />
      )}
    </div>
  );
}

/**
 * Prompt the user to pick the PDF for a just-loaded Presentation_File (Req 9.5).
 * A thin wrapper over the OS file picker rendered as a small dialog.
 */
function NeedPdfDialog({
  onPick,
  onCancel,
}: {
  onPick: (file: File) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Open the presentation's PDF"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          maxWidth: 420,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Open the presentation&apos;s PDF</h2>
        <p style={{ color: '#374151' }}>
          This presentation references a PDF. Choose it to finish loading. It is
          read locally and never uploaded.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPick(f);
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '8px 14px' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: '8px 14px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Choose PDF…
          </button>
        </div>
      </div>
    </div>
  );
}
