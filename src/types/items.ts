/**
 * White-space item and structural types that live in the Document store
 * (design "In-memory state" / "Data Models").
 *
 * Positions and sizes of white-space items (Notes, Images, Crops' on-canvas
 * placement) are in canvas coordinates. Focus_Areas and Crop *source*
 * rectangles are in Page coordinates so they stay anchored to the paper.
 */

import type { RectCanvas, RectPage } from './geometry';

/**
 * A highlighted region of a Page. The rectangle is stored in Page coordinates
 * and clamped to the page bounds (Req 3.4).
 */
export interface FocusArea {
  id: string;
  /** Zero-based index of the page this Focus_Area belongs to. */
  pageIndex: number;
  /** Rectangle in Page coordinates, clamped to the page. */
  rect: RectPage;
}

/** An editable text note placed in canvas white space. */
export interface Note {
  id: string;
  /** Placement in canvas coordinates. */
  rect: RectCanvas;
  /** Note body text. */
  text: string;
}

/** An imported image placed in canvas white space. */
export interface ImageItem {
  id: string;
  /** Placement in canvas coordinates (aspect-preserving on resize). */
  rect: RectCanvas;
  /** The raster encoded as a data URL. */
  dataURL: string;
}

/**
 * A crop of a region of a Page re-rendered onto its own canvas and placed in
 * white space. The source rectangle is in Page coordinates; the placement is
 * in canvas coordinates. The rendered bitmap is never persisted.
 */
export interface Crop {
  id: string;
  /** Zero-based index of the source page. */
  sourcePageIndex: number;
  /** Source region in Page coordinates. */
  sourceRect: RectPage;
  /** Placement in canvas coordinates (aspect-preserving on resize). */
  rect: RectCanvas;
}

/**
 * Identifier of anything a Connector can attach to (any white-space item or
 * Focus_Area).
 */
export type ConnectorTargetId = string;

/** A line connecting two items, with endpoints on each item's nearest edge. */
export interface Connector {
  id: string;
  fromItemId: string;
  toTargetId: ConnectorTargetId;
}

/**
 * One ordered Step of the presentation Sequence. Each Step references exactly
 * one item (Focus_Area or white-space item) and may carry a speaker note.
 */
export interface Step {
  id: string;
  /** Id of the single item this Step focuses on. */
  itemId: string;
  /** Optional speaker note shown in the side panel. */
  speakerNote?: string;
}
