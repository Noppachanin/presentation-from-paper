/**
 * UI chrome barrel (task 14.1).
 *
 * The presentational editor chrome: the Toolbar, the Sequence side panel, the
 * dialogs (open PDF, load/save, mismatch, error, oversized-image), the start
 * screen, and the shared Dialog shell. The Ink_Palette and Present_Mode
 * indicators (task 14.2) and the app shell wiring (task 15.1) are added later.
 *
 * Import from `../ui` (or `@/ui`) rather than the individual files so the
 * module layout can change without touching call sites.
 */

// Toolbar (Req 2.5, 2.6, 11.12)
export { Toolbar, TOOLBAR_TOOLS } from './Toolbar';
export type { ToolbarProps } from './Toolbar';

// Current-page / zoom readout helpers (Req 2.6)
export {
  zoomPercent,
  viewportCenterCanvas,
  currentPageIndex,
  currentPageNumber,
} from './currentPage';

// Sequence side panel (Req 6.1, 6.2, 6.5)
export { SequencePanel, stepTargetKind } from './SequencePanel';
export type { SequencePanelProps } from './SequencePanel';

// Dialog shell
export { Dialog, DialogButton } from './Dialog';
export type { DialogProps } from './Dialog';

// Concrete dialogs (Req 10.7, 9.6, 9.7, 9.8, 4.10, 1.5, 9.4, 9.10)
export {
  OpenPdfDialog,
  LoadPresentationDialog,
  MismatchDialog,
  ErrorDialog,
  OversizedImageDialog,
  formatBytes,
  IMAGE_ACCEPT,
} from './dialogs';
export type {
  OpenPdfDialogProps,
  LoadPresentationDialogProps,
  MismatchDialogProps,
  ErrorDialogProps,
  OversizedImageDialogProps,
} from './dialogs';

// Start screen (Req 10.7)
export { StartScreen } from './StartScreen';
export type { StartScreenProps } from './StartScreen';

// Ink_Palette (task 14.2, Req 8.11, 11.10, 11.11, 14.2, 14.3, 14.6, 14.14, 14.18, 14.23)
export {
  InkPalette,
  INK_COLORS,
  INK_WIDTHS,
  DEFAULT_INK_COLOR,
  DEFAULT_INK_WIDTH,
} from './InkPalette';
export type { InkPaletteProps } from './InkPalette';

// Clear-ink default action (Req 14.18, 11.8)
export { clearKeptInk } from './clearInk';

// Present_Mode step indicator (task 14.2, Req 8.10)
export { StepIndicator } from './StepIndicator';
export type { StepIndicatorProps, StepIndicatorHandle } from './StepIndicator';

// Step-indicator fade logic (Req 8.10)
export { useFadeAfter, STEP_INDICATOR_FADE_MS } from './stepFade';
export type { FadeController } from './stepFade';

// Fullscreen control (task 14.2, Req 8.9)
export { FullscreenButton } from './FullscreenButton';
export type { FullscreenButtonProps } from './FullscreenButton';
export { requestFullscreen, canRequestFullscreen } from './fullscreen';
