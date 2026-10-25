/**
 * Sequence module barrel (task 11.5).
 *
 * Three layers are exported:
 *
 *  - **Pure recipes + selectors** (`sequenceModel`): functions over an Immer
 *    draft of `DocumentState` (reorder, Step deletion, speaker notes) and pure
 *    reads (position label, speaker-note read, Step target rect, camera for a
 *    Step). No store/DOM dependency — the property/unit tests (tasks 11.6/11.7)
 *    drive these directly. {@link appendStep} is re-exported from `../items` so
 *    any append path reuses the one shared helper (Req 3.2/4.7).
 *  - **Navigation** (`navigation`): next/previous Step with end clamping. These
 *    change transient Session state (`currentStepIndex`) and are deliberately
 *    excluded from undo history (Req 8.5/8.6).
 *  - **Store actions** (`sequenceActions`): thin wrappers that apply one recipe
 *    per user action through the history store, so each action is one undo unit
 *    (Req 6.2/6.4/6.6). The side panel (task 14.1) calls these.
 *
 * Import from `../sequence` (or `@/sequence`) rather than the individual files.
 */

// Pure recipes + selectors (Req 3.2, 4.7, 6.2, 6.3, 6.4, 6.6)
export {
  appendStep,
  reorderStep,
  deleteStepFromSequence,
  setSpeakerNote,
  getSpeakerNote,
  focusAreaLabel,
  stepTargetRect,
  cameraForStep,
} from './sequenceModel';

// Navigation (session state, not undoable — Req 8.5, 8.6)
export {
  clampStepIndex,
  nextStepIndex,
  prevStepIndex,
  canNext,
  canPrev,
  nextStep,
  prevStep,
} from './navigation';

// Store-facing actions (one undo entry per user action — Req 6.2, 6.4, 6.6)
export {
  moveStep,
  removeStepFromSequence,
  setStepSpeakerNote,
} from './sequenceActions';
