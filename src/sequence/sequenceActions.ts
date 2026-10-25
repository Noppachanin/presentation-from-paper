/**
 * Store-facing Sequence actions — thin wrappers around the pure recipes in
 * `sequenceModel.ts` (task 11.5).
 *
 * Each exported function is **one user action == one undo entry**: it calls
 * `useHistoryStore.getState().recordEdit(label, recipe)` exactly once, applying
 * the edit to the Document store (via its Immer `update`) and recording it as a
 * single command (consistent with `items/itemActions.ts`). Keeping these
 * wrappers separate from the pure recipes keeps the core logic store-free and
 * testable (tasks 11.6/11.7).
 *
 * NOTE: Step navigation (next/previous) is NOT here — it is transient session
 * state and must stay out of undo history, so it lives in `navigation.ts` and
 * goes through the Session store setter instead of `recordEdit`.
 *
 * Import from `../sequence`.
 */

import { useHistoryStore } from '../state';
import type { DocumentState } from '../types';
import {
  deleteStepFromSequence,
  reorderStep,
  setSpeakerNote,
} from './sequenceModel';

/** Record one editing action against the Document store. */
function record(label: string, recipe: (draft: DocumentState) => void): void {
  useHistoryStore.getState().recordEdit(label, recipe);
}

/**
 * Reorder a Step within the Sequence (Req 6.2) as one undo entry. Position
 * labels update implicitly because they are derived from order.
 */
export function moveStep(fromIndex: number, toIndex: number): void {
  record('reorder step', (draft) => {
    reorderStep(draft, fromIndex, toIndex);
  });
}

/**
 * Remove a Step from the Sequence while keeping the referenced item on the
 * canvas (Req 6.4) as one undo entry — the side-panel "remove from sequence".
 */
export function removeStepFromSequence(stepId: string): void {
  record('remove step from sequence', (draft) => {
    deleteStepFromSequence(draft, stepId);
  });
}

/** Set a Step's speaker note (Req 6.6) as one undo entry. */
export function setStepSpeakerNote(stepId: string, text: string): void {
  record('edit speaker note', (draft) => {
    setSpeakerNote(draft, stepId, text);
  });
}
