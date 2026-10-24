/**
 * Store-facing item/connector actions — the thin wrappers around the pure
 * recipes in `itemOperations.ts` and `connectorOperations.ts`.
 *
 * Each exported function is **one user action == one undo entry**: it calls
 * `useHistoryStore.getState().recordEdit(label, recipe)` exactly once, so the
 * edit is applied to the Document store (via its Immer `update`) and recorded
 * as a single command (Req 11.x; design "Undo/redo history"). Creation actions
 * capture the new item's id from the recipe and return it to the caller.
 *
 * Keeping these wrappers separate from the pure recipes means the core logic
 * stays store-free and unit-testable (tasks 11.2–11.4), while the UI (task 14)
 * calls these functions and gets correct history behaviour for free. Import
 * from `../items`.
 */

import { useHistoryStore } from '../state';
import type { RectCanvas, RectPage } from '../types';
import {
  createCrop,
  createFocusArea,
  createImageItem,
  createNote,
  deleteFocusArea,
  deleteWhiteSpaceItem,
  moveWhiteSpaceItem,
  resizeWhiteSpaceItem,
  updateFocusAreaRect,
  updateNoteText,
} from './itemOperations';
import {
  createConnector,
  deleteConnector,
} from './connectorOperations';

/** Record one editing action against the Document store. */
function record(label: string, recipe: (draft: import('../types').DocumentState) => void): void {
  useHistoryStore.getState().recordEdit(label, recipe);
}

/**
 * Create a Focus_Area (Req 3.1–3.4) as one undo entry. Returns the new id, or
 * `undefined` when the drag was discarded (too small / unknown page). When
 * discarded, nothing is recorded in history and the Sequence is unchanged.
 */
export function addFocusArea(
  pageIndex: number,
  rectPage: RectPage,
  screenWidth: number,
  screenHeight: number,
): string | undefined {
  let created: string | undefined;
  record('create focus area', (draft) => {
    created = createFocusArea(draft, pageIndex, rectPage, screenWidth, screenHeight);
  });
  return created;
}

/** Move/resize a Focus_Area within the page (Req 3.5) as one undo entry. */
export function setFocusAreaRect(focusId: string, nextRect: RectPage): void {
  record('move/resize focus area', (draft) => {
    updateFocusAreaRect(draft, focusId, nextRect);
  });
}

/** Delete a Focus_Area and cascade (Req 3.6) as one undo entry. */
export function removeFocusArea(focusId: string): void {
  record('delete focus area', (draft) => {
    deleteFocusArea(draft, focusId);
  });
}

/** Create a Note (Req 4.1) as one undo entry. Returns the new Note id. */
export function addNote(rect: RectCanvas, text = ''): string {
  let created = '';
  record('create note', (draft) => {
    created = createNote(draft, rect, text);
  });
  return created;
}

/** Edit a Note's text (Req 4.1) as one undo entry. */
export function setNoteText(noteId: string, text: string): void {
  record('edit note text', (draft) => {
    updateNoteText(draft, noteId, text);
  });
}

/**
 * Create an Image_Item from a validated data URL (Req 4.2) as one undo entry.
 * Type/size validation (Req 4.9, 4.10) is performed by the caller via
 * `validateImage` before this is called. Returns the new Image_Item id.
 */
export function addImageItem(rect: RectCanvas, dataURL: string): string {
  let created = '';
  record('create image', (draft) => {
    created = createImageItem(draft, rect, dataURL);
  });
  return created;
}

/**
 * Create a Crop of a Page region placed in white space (Req 4.3), together with
 * its auto-Connector to the source region (Req 5.2), as one undo entry. Returns
 * the new Crop id.
 */
export function addCrop(
  sourcePageIndex: number,
  sourceRect: RectPage,
  rect: RectCanvas,
): string {
  let created = '';
  record('create crop', (draft) => {
    created = createCrop(draft, sourcePageIndex, sourceRect, rect);
  });
  return created;
}

/** Move a White_Space_Item (Req 4.5) as one undo entry. */
export function moveItem(itemId: string, x: number, y: number): void {
  record('move item', (draft) => {
    moveWhiteSpaceItem(draft, itemId, x, y);
  });
}

/** Resize a White_Space_Item, aspect-preserving for images/crops (Req 4.6). */
export function resizeItem(itemId: string, width: number, height: number): void {
  record('resize item', (draft) => {
    resizeWhiteSpaceItem(draft, itemId, width, height);
  });
}

/** Delete a White_Space_Item and cascade (Req 4.8) as one undo entry. */
export function removeWhiteSpaceItem(itemId: string): void {
  record('delete item', (draft) => {
    deleteWhiteSpaceItem(draft, itemId);
  });
}

/**
 * Create a Connector between a White_Space_Item and a Focus_Area (Req 5.1) as
 * one undo entry. Returns the new Connector id, or `undefined` when it was not
 * created (duplicate / unresolved target / self-link).
 */
export function addConnector(fromItemId: string, toTargetId: string): string | undefined {
  let created: string | undefined;
  record('create connector', (draft) => {
    created = createConnector(draft, fromItemId, toTargetId);
  });
  return created;
}

/** Delete a Connector, leaving items unchanged (Req 5.4), as one undo entry. */
export function removeConnector(connectorId: string): void {
  record('delete connector', (draft) => {
    deleteConnector(draft, connectorId);
  });
}
