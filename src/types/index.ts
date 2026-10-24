/**
 * Shared type barrel. Import application types from `@/types` (or a relative
 * path to `src/types`) rather than from the individual files so the module
 * layout can change without touching call sites.
 */

export type { Point, RectCanvas, RectPage, Camera, Viewport, PagePlacement } from './geometry';
export type { PdfFingerprint } from './pdf';
export type { InkPoint, InkStroke } from './ink';
export type { Tool } from './tools';
export type {
  FocusArea,
  Note,
  ImageItem,
  Crop,
  Connector,
  ConnectorTargetId,
  Step,
} from './items';
export type { DocumentState, SessionState, InkClearPolicy } from './state';
