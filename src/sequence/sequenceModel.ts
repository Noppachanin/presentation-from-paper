/**
 * Pure Sequence model — reorder, position labels, Step deletion, speaker notes,
 * and click-to-animate target resolution (task 11.5).
 *
 * ## Approach: pure draft recipes + pure selectors
 * Mirroring task 11.1 (`items/itemOperations.ts`), every *mutation* here is a
 * pure function over an Immer draft of the `DocumentState`:
 * `(draft, ...args) => void`. It reads and mutates only the draft — never the
 * store or the DOM — so it is directly unit-/property-testable (tasks 11.6/11.7)
 * by running it through `immer.produce` on a plain `DocumentState`. The
 * store-facing side (one undo entry per user action via `recordEdit`) lives in
 * `sequenceActions.ts`.
 *
 * Every *read* here is a pure selector `(doc, ...args) => value` taking a plain
 * `DocumentState` (works on a draft or a committed state alike).
 *
 * ## Step appending is NOT re-implemented here
 * Creating any item already appends its Step: `createFocusArea` / `createNote` /
 * `createImageItem` / `createCrop` call {@link appendStep} (items/itemOperations.ts,
 * Req 3.2, 4.7). This module therefore owns only what happens *after* the
 * append — reordering, position labels, Step removal, speaker notes, and
 * navigation — and re-exports {@link appendStep} so any future append path uses
 * the one shared helper instead of pushing a second Step.
 *
 * ## Position labels are DERIVED, never stored (design Property 7)
 * A Focus_Area's displayed position label is its 1-based index in the Sequence.
 * The label is computed on demand by {@link focusAreaLabel}; nothing stores a
 * label field. Reordering the Sequence ({@link reorderStep}) therefore updates
 * every label implicitly — there is nothing to keep in sync (Req 6.2).
 *
 * ## Deleting a Step keeps the item (Req 6.4)
 * {@link deleteStepFromSequence} removes only the Step from the Sequence and
 * leaves the referenced Focus_Area / Note / Image / Crop on the canvas. This is
 * the side-panel "remove from sequence" action, and is deliberately the
 * opposite of `deleteFocusArea` / `deleteWhiteSpaceItem` (items/itemOperations.ts),
 * which remove BOTH the item and its Step.
 *
 * ## Coordinate spaces for click-to-animate (Req 6.3)
 * {@link stepTargetRect} resolves a Step's referenced item to a **canvas-space**
 * rectangle so the camera can fit it:
 *  - Focus_Area: stored in Page coordinates; converted via `pageToCanvas` using
 *    the item's page placement.
 *  - Note / Image_Item / Crop: already stored in canvas coordinates.
 * The actual rAF camera animation is task 15.1; here we only expose the target
 * rectangle and a thin {@link cameraForStep} that defers to `cameraForTarget`.
 */

import {
  cameraForTarget,
} from '../camera';
import { pageToCanvas } from '../geometry';
import type {
  Camera,
  DocumentState,
  RectCanvas,
  Step,
  Viewport,
} from '../types';

// Re-export the shared Step-append helper so any append path reuses it rather
// than pushing a second Step (Req 3.2, 4.7). Creation recipes already call it.
export { appendStep } from '../items';

/**
 * Clamp an index into the valid range `[0, length)`. Returns a value within the
 * array bounds, or `0` when the array is empty (there is no valid slot, but a
 * splice at 0 is a no-op on an empty array).
 */
function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index > length - 1) {
    return length - 1;
  }
  return index;
}

/**
 * Move a Step within the Sequence from `fromIndex` to `toIndex` (Req 6.2).
 *
 * Both indices are clamped to the current Sequence bounds, so an out-of-range
 * drag lands at the nearest end instead of throwing. A no-op move (same
 * position, empty sequence) leaves the Sequence unchanged. Because position
 * labels are derived from order ({@link focusAreaLabel}), reordering updates
 * every Focus_Area's label implicitly — nothing else needs touching.
 */
export function reorderStep(
  draft: DocumentState,
  fromIndex: number,
  toIndex: number,
): void {
  const length = draft.sequence.length;
  if (length < 2) {
    return; // nothing to reorder
  }
  const from = clampIndex(fromIndex, length);
  const to = clampIndex(toIndex, length);
  if (from === to) {
    return;
  }
  const [moved] = draft.sequence.splice(from, 1);
  draft.sequence.splice(to, 0, moved);
}

/**
 * Remove the Step `stepId` from the Sequence but KEEP the item it references on
 * the canvas (Req 6.4). This is the side-panel "remove from sequence" action —
 * contrast `deleteFocusArea` / `deleteWhiteSpaceItem`, which remove the item and
 * its Step together. No-op when no Step has that id.
 */
export function deleteStepFromSequence(draft: DocumentState, stepId: string): void {
  draft.sequence = draft.sequence.filter((s) => s.id !== stepId);
}

/**
 * Store (or update) the speaker note text on the Step `stepId` (Req 6.6).
 * No-op when no Step has that id. Passing an empty string stores an empty note;
 * callers that want to clear a note may pass `''`.
 */
export function setSpeakerNote(draft: DocumentState, stepId: string, text: string): void {
  const step = draft.sequence.find((s) => s.id === stepId);
  if (step !== undefined) {
    step.speakerNote = text;
  }
}

/**
 * Read the speaker note stored on a Step (Req 6.5/6.6), or `undefined` when the
 * Step has no note or does not exist. Pure selector over a `DocumentState`.
 */
export function getSpeakerNote(doc: DocumentState, stepId: string): string | undefined {
  return doc.sequence.find((s) => s.id === stepId)?.speakerNote;
}

/**
 * The 1-based position label of a Focus_Area = its 1-based index in the
 * Sequence (design Property 7, Req 6.2). Returns `undefined` when the
 * Focus_Area is not referenced by any Step. Derived, never stored, so it always
 * reflects the current order.
 *
 * The label is the position of the *first* Step referencing the Focus_Area; in
 * normal use each item has exactly one Step.
 */
export function focusAreaLabel(doc: DocumentState, focusId: string): number | undefined {
  const index = doc.sequence.findIndex((s) => s.itemId === focusId);
  return index === -1 ? undefined : index + 1;
}

/**
 * Resolve a Step's referenced item to a **canvas-space** rectangle for
 * click-to-animate (Req 6.3). Returns `undefined` when the item (or, for a
 * Focus_Area, its page placement) can no longer be resolved.
 *
 *  - Focus_Area: `rect` is in Page coordinates; both corners are mapped through
 *    `pageToCanvas` using the matching page placement so the canvas rectangle
 *    follows the current layout.
 *  - Note / Image_Item / Crop: `rect` is already in canvas coordinates.
 */
export function stepTargetRect(doc: DocumentState, step: Step): RectCanvas | undefined {
  const { itemId } = step;

  const focus = doc.focusAreas.find((f) => f.id === itemId);
  if (focus !== undefined) {
    const page = doc.pages.find((p) => p.pageIndex === focus.pageIndex);
    if (page === undefined) {
      return undefined;
    }
    const topLeft = pageToCanvas({ x: focus.rect.x, y: focus.rect.y }, page);
    const bottomRight = pageToCanvas(
      { x: focus.rect.x + focus.rect.width, y: focus.rect.y + focus.rect.height },
      page,
    );
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  const note = doc.notes.find((n) => n.id === itemId);
  if (note !== undefined) {
    return { ...note.rect };
  }

  const image = doc.images.find((i) => i.id === itemId);
  if (image !== undefined) {
    return { ...image.rect };
  }

  const crop = doc.crops.find((c) => c.id === itemId);
  if (crop !== undefined) {
    return { ...crop.rect };
  }

  return undefined;
}

/**
 * The Camera that fits a Step's target in the viewport (Req 6.3, 7.1), or
 * `undefined` when the Step's target cannot be resolved ({@link stepTargetRect}).
 * Thin wrapper over the camera service's `cameraForTarget` — the actual
 * animated transition loop is task 15.1; this lets the side panel / navigation
 * ask for the destination Camera of a Step.
 */
export function cameraForStep(
  doc: DocumentState,
  step: Step,
  viewport: Viewport,
): Camera | undefined {
  const rect = stepTargetRect(doc, step);
  if (rect === undefined) {
    return undefined;
  }
  return cameraForTarget(rect, viewport);
}
