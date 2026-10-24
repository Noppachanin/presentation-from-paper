/**
 * Top-level store shapes (design "Data Models" / "In-memory state").
 *
 * State is split into a persisted Document store and a transient Session store.
 */

import type { Camera } from './geometry';
import type { PagePlacement } from './geometry';
import type { PdfFingerprint } from './pdf';
import type { InkStroke } from './ink';
import type { Tool } from './tools';
import type {
  Connector,
  Crop,
  FocusArea,
  ImageItem,
  Note,
  Step,
} from './items';

/**
 * Everything persisted to a Presentation_File. The PDF content, rendered Crop
 * bitmaps, and Discussion_Ink are deliberately excluded (Req 9.2, 9.3, 9.13).
 */
export interface DocumentState {
  /** Presentation_File schema version. */
  version: number;
  /** Identity of the PDF this presentation was authored against. */
  pdf: PdfFingerprint;
  /** Canvas-space placement of each page (derived from the layout). */
  pages: PagePlacement[];
  /** Highlighted Page regions (rect in Page coords + pageIndex). */
  focusAreas: FocusArea[];
  /** Text notes in white space. */
  notes: Note[];
  /** Imported images in white space (raster as data URL). */
  images: ImageItem[];
  /** Page crops: source rect in Page coords + canvas placement. */
  crops: Crop[];
  /** Connectors between items. */
  connectors: Connector[];
  /** Ordered Sequence; each Step references exactly one item. */
  sequence: Step[];
  /** Camera restored when the presentation is opened. */
  initialCamera: Camera;
  /** Kept_Ink strokes only (Discussion_Ink is never persisted). */
  keptInk: InkStroke[];
}

/** Policy controlling when Discussion_Ink is automatically removed. */
export type InkClearPolicy =
  | 'keep-until-cleared'
  | 'fade-out'
  | 'clear-on-step-change';

/**
 * Transient session state: the current mode, active tool, Discussion_Ink, and
 * user settings. None of this is persisted to the Presentation_File.
 */
export interface SessionState {
  /** Current application mode. */
  mode: 'edit' | 'present';
  /** The currently selected tool. */
  activeTool: Tool;
  /** Transient ink drawn during discussion; excluded from the file (Req 9.13). */
  discussionInk: InkStroke[];
  /** When true, newly drawn strokes become Kept_Ink. Defaults to false. */
  keepInkToggle: boolean;
  /** How Discussion_Ink is cleared. Defaults to 'keep-until-cleared'. */
  inkClearPolicy: InkClearPolicy;
  /** Fade-out delay in seconds (1..30, default 5). */
  fadeDelaySeconds: number;
  /** When true, Camera transitions are instant (reduce-motion). */
  reduceMotion: boolean;
  /** Index of the current Step in the Sequence. */
  currentStepIndex: number;
  /** Unsaved-changes guard flag (Req 9.12). */
  dirty: boolean;
}
