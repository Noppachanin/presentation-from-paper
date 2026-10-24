/**
 * Pure item operations for Focus_Areas and White_Space_Items (Notes,
 * Image_Items, Crops).
 *
 * ## Approach: pure draft recipes + thin store wrappers
 * Every operation here is a **pure function over an Immer draft** of the
 * `DocumentState`: `(draft, ...args) => void` for mutations, or
 * `(draft, ...args) => string` when it needs to return the new item's id. They
 * read and mutate only the draft, never the store or the DOM, so they are
 * directly unit-/property-testable without React (tasks 11.2–11.4) — just pass
 * a plain `DocumentState` through `immer.produce`.
 *
 * The store-facing side (one history entry per user action) lives in
 * `itemActions.ts`, which wraps each recipe in a single
 * `useHistoryStore.getState().recordEdit(label, recipe)` call. This file has no
 * store dependency on purpose.
 *
 * ## Coordinate spaces
 *  - Focus_Areas store their rectangle in **Page coordinates** (Req 3.1) and
 *    are clamped to the page bounds (Req 3.4).
 *  - Notes, Image_Items, and Crops store their placement in **canvas
 *    coordinates**; Crops additionally store a **Page-coordinate** source rect.
 *
 * ## The 8px minimum is a SCREEN-pixel threshold
 * Req 3.3 discards a drawn Focus_Area whose width or height is smaller than 8
 * *screen* pixels. The rectangle itself is stored in Page coordinates, so the
 * caller passes the already-measured screen size (`screenWidth`/`screenHeight`)
 * of the drag alongside the page rect. `createFocusArea` returns `undefined`
 * (and leaves the draft untouched) when either screen dimension is below the
 * threshold, so the Sequence is unchanged (Req 3.3).
 *
 * ## Step appending is shared with the Sequence model (task 11.5)
 * Creating any item appends a Step referencing it (Req 3.2, 4.7). That append
 * is done here via the small {@link appendStep} helper, which is **exported for
 * task 11.5 to reuse** — 11.5 owns reorder / position-labels / navigation and
 * must call this same helper rather than appending a second Step.
 */

import type {
  Crop,
  DocumentState,
  FocusArea,
  ImageItem,
  Note,
  RectCanvas,
  RectPage,
  Step,
} from '../types';
import { clampRectWithin } from '../geometry';
import { newId } from './ids';
import { removeConnectorsReferencing } from './connectorOperations';

/** Req 3.3 minimum Focus_Area size, in screen pixels. */
export const MIN_FOCUS_SCREEN_PX = 8;

/**
 * Append a Step referencing `itemId` to the end of the Sequence and return the
 * new Step's id (Req 3.2, 4.7).
 *
 * Shared helper: the item-creation recipes below call this, and the Sequence
 * model (task 11.5) must reuse it rather than appending its own Step, so an
 * item never ends up with two Steps. 11.5 owns everything *after* the append
 * (reordering, position labels, navigation).
 */
export function appendStep(draft: DocumentState, itemId: string): string {
  const step: Step = { id: newId(), itemId };
  draft.sequence.push(step);
  return step.id;
}

/** The page placement bounds in Page coordinates: origin at (0,0). */
function pageBoundsFor(draft: DocumentState, pageIndex: number): RectPage | undefined {
  const page = draft.pages.find((p) => p.pageIndex === pageIndex);
  if (page === undefined) {
    return undefined;
  }
  return { x: 0, y: 0, width: page.pageWidth, height: page.pageHeight };
}

/**
 * Create a Focus_Area on a Page from a rectangle already expressed in **Page
 * coordinates** (Req 3.1), discarding tiny drags and clamping to the page.
 *
 * @param draft        the Document draft to mutate
 * @param pageIndex    zero-based index of the target Page
 * @param rectPage     the drawn rectangle in Page coordinates
 * @param screenWidth  the drag width in SCREEN pixels (for the 8px test, Req 3.3)
 * @param screenHeight the drag height in SCREEN pixels (for the 8px test, Req 3.3)
 * @returns the new Focus_Area id, or `undefined` when the drag was discarded
 *          (too small, or the page is unknown) — in which case the draft and
 *          the Sequence are left unchanged (Req 3.3).
 */
export function createFocusArea(
  draft: DocumentState,
  pageIndex: number,
  rectPage: RectPage,
  screenWidth: number,
  screenHeight: number,
): string | undefined {
  // Req 3.3: discard a drag smaller than 8 screen px on either axis. Measured
  // in screen pixels because the stored rect is in page coordinates.
  if (
    Math.abs(screenWidth) < MIN_FOCUS_SCREEN_PX ||
    Math.abs(screenHeight) < MIN_FOCUS_SCREEN_PX
  ) {
    return undefined;
  }

  const bounds = pageBoundsFor(draft, pageIndex);
  if (bounds === undefined) {
    return undefined;
  }

  // Normalize a possibly-negative drag (right-to-left / bottom-to-top) to a
  // top-left origin with non-negative size before clamping.
  const normalized: RectPage = {
    x: rectPage.width < 0 ? rectPage.x + rectPage.width : rectPage.x,
    y: rectPage.height < 0 ? rectPage.y + rectPage.height : rectPage.y,
    width: Math.abs(rectPage.width),
    height: Math.abs(rectPage.height),
  };

  // Req 3.4: clamp the rectangle to the Page boundary.
  const clamped = clampRectWithin(normalized, bounds);

  const focus: FocusArea = { id: newId(), pageIndex, rect: clamped };
  draft.focusAreas.push(focus);
  appendStep(draft, focus.id); // Req 3.2
  return focus.id;
}

/**
 * Move and/or resize a Focus_Area, keeping it within the Page boundary (Req
 * 3.5). `nextRect` is the proposed rectangle in Page coordinates; it is clamped
 * to the page before being stored. No-op if the Focus_Area or its page is gone.
 */
export function updateFocusAreaRect(
  draft: DocumentState,
  focusId: string,
  nextRect: RectPage,
): void {
  const focus = draft.focusAreas.find((f) => f.id === focusId);
  if (focus === undefined) {
    return;
  }
  const bounds = pageBoundsFor(draft, focus.pageIndex);
  if (bounds === undefined) {
    return;
  }
  focus.rect = clampRectWithin(nextRect, bounds);
}

/**
 * Delete a Focus_Area and cascade: remove the Step(s) that reference it and any
 * Connectors attached to it (Req 3.6). Leaves no dangling references.
 */
export function deleteFocusArea(draft: DocumentState, focusId: string): void {
  draft.focusAreas = draft.focusAreas.filter((f) => f.id !== focusId);
  draft.sequence = draft.sequence.filter((s) => s.itemId !== focusId);
  removeConnectorsReferencing(draft, focusId);
}

/**
 * Create a Note at a canvas-space location (Req 4.1). `rect` is the Note's
 * canvas placement; `text` defaults to empty (the UI places the text cursor).
 * Appends a referencing Step (Req 4.7). Returns the new Note id.
 */
export function createNote(
  draft: DocumentState,
  rect: RectCanvas,
  text = '',
): string {
  const note: Note = { id: newId(), rect, text };
  draft.notes.push(note);
  appendStep(draft, note.id);
  return note.id;
}

/** Replace a Note's body text. No-op if the Note is gone. */
export function updateNoteText(draft: DocumentState, noteId: string, text: string): void {
  const note = draft.notes.find((n) => n.id === noteId);
  if (note !== undefined) {
    note.text = text;
  }
}

/**
 * Create an Image_Item from a validated data URL at a canvas-space placement
 * (Req 4.2). Type/size validation is the caller's job (see `validation.ts`);
 * this only records the item. Appends a referencing Step (Req 4.7). Returns the
 * new Image_Item id.
 */
export function createImageItem(
  draft: DocumentState,
  rect: RectCanvas,
  dataURL: string,
): string {
  const image: ImageItem = { id: newId(), rect, dataURL };
  draft.images.push(image);
  appendStep(draft, image.id);
  return image.id;
}

/**
 * Create a Crop of a Page region placed in white space (Req 4.3). `sourceRect`
 * is in Page coordinates; `rect` is the canvas placement chosen by the user.
 * Appends a referencing Step (Req 4.7) and an auto-Connector from the Crop to
 * its source Page region (Req 5.2). Returns the new Crop id.
 */
export function createCrop(
  draft: DocumentState,
  sourcePageIndex: number,
  sourceRect: RectPage,
  rect: RectCanvas,
): string {
  const crop: Crop = { id: newId(), sourcePageIndex, sourceRect, rect };
  draft.crops.push(crop);
  appendStep(draft, crop.id);
  // Req 5.2: a Crop auto-connects to its source region on the Page. The source
  // target id is the Crop's own id — the overlay resolves the source rectangle
  // from the Crop's sourcePageIndex/sourceRect (there is no separate region
  // entity to reference), so the Connector links the Crop to itself-as-source.
  draft.connectors.push({
    id: newId(),
    fromItemId: crop.id,
    toTargetId: crop.id,
  });
  return crop.id;
}

/**
 * Move a White_Space_Item (Note, Image_Item, or Crop) to a new canvas-space
 * top-left, preserving its size (Req 4.5). No-op if the id matches no
 * white-space item.
 */
export function moveWhiteSpaceItem(
  draft: DocumentState,
  itemId: string,
  x: number,
  y: number,
): void {
  const note = draft.notes.find((n) => n.id === itemId);
  if (note !== undefined) {
    note.rect.x = x;
    note.rect.y = y;
    return;
  }
  const image = draft.images.find((i) => i.id === itemId);
  if (image !== undefined) {
    image.rect.x = x;
    image.rect.y = y;
    return;
  }
  const crop = draft.crops.find((c) => c.id === itemId);
  if (crop !== undefined) {
    crop.rect.x = x;
    crop.rect.y = y;
  }
}

/**
 * Resize a White_Space_Item (Req 4.6). For a Note the new width/height are
 * applied directly. For an Image_Item or a Crop the aspect ratio of the current
 * rectangle is preserved: the proposed size is fit to that ratio (using the
 * larger of the proposed dimensions as the driver) so images and crops never
 * distort. No-op if the id matches no white-space item.
 */
export function resizeWhiteSpaceItem(
  draft: DocumentState,
  itemId: string,
  width: number,
  height: number,
): void {
  const w = Math.max(0, width);
  const h = Math.max(0, height);

  const note = draft.notes.find((n) => n.id === itemId);
  if (note !== undefined) {
    note.rect.width = w;
    note.rect.height = h;
    return;
  }

  const image = draft.images.find((i) => i.id === itemId);
  if (image !== undefined) {
    const fitted = fitToAspect(image.rect, w, h);
    image.rect.width = fitted.width;
    image.rect.height = fitted.height;
    return;
  }

  const crop = draft.crops.find((c) => c.id === itemId);
  if (crop !== undefined) {
    const fitted = fitToAspect(crop.rect, w, h);
    crop.rect.width = fitted.width;
    crop.rect.height = fitted.height;
  }
}

/**
 * Fit a proposed `width`/`height` to the aspect ratio of `current`, preserving
 * that ratio (Req 4.6). The dimension that changed the most (relative to the
 * current size) drives the result so dragging a corner feels natural. Falls
 * back to the proposed size when the current rectangle is degenerate.
 */
function fitToAspect(
  current: RectCanvas,
  width: number,
  height: number,
): { width: number; height: number } {
  if (current.width <= 0 || current.height <= 0) {
    return { width, height };
  }
  const aspect = current.width / current.height;
  // Pick the driving axis by larger relative change so the preserved ratio
  // follows the dominant drag direction.
  const dw = Math.abs(width - current.width) / current.width;
  const dh = Math.abs(height - current.height) / current.height;
  if (dw >= dh) {
    return { width, height: width / aspect };
  }
  return { width: height * aspect, height };
}

/**
 * Delete a White_Space_Item and cascade: remove the Step(s) that reference it
 * and any Connectors attached to it (Req 4.8). Works for a Note, Image_Item, or
 * Crop. Leaves no dangling references.
 */
export function deleteWhiteSpaceItem(draft: DocumentState, itemId: string): void {
  draft.notes = draft.notes.filter((n) => n.id !== itemId);
  draft.images = draft.images.filter((i) => i.id !== itemId);
  draft.crops = draft.crops.filter((c) => c.id !== itemId);
  draft.sequence = draft.sequence.filter((s) => s.itemId !== itemId);
  removeConnectorsReferencing(draft, itemId);
}
