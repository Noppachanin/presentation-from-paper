/**
 * Step navigation (session state, NOT undoable) — next / previous with end
 * clamping (task 11.5, Req 8.5/8.6).
 *
 * ## Why this is session state, not a document edit
 * Which Step is current (`currentStepIndex`) is transient viewing state, not
 * part of the persisted document. So navigation goes through the Session
 * store's `setCurrentStepIndex` setter — NOT through `recordEdit` — and is
 * therefore excluded from undo history (consistent with Req 11.5's exclusion of
 * Camera moves). The document is read only to know the Sequence length for
 * clamping.
 *
 * ## End clamping (Req 8.5, 8.6)
 * `nextStep` on the last Step keeps the index (Req 8.5); `prevStep` on the first
 * Step keeps the index (Req 8.6). The index is always kept within
 * `[0, sequence.length - 1]`. An empty Sequence has no valid Step, so the
 * current index is normalised to `0` and next/prev are no-ops.
 *
 * ## Pure vs. store layers
 * The clamping math lives in pure helpers ({@link clampStepIndex},
 * {@link nextStepIndex}, {@link prevStepIndex}, {@link canNext}, {@link canPrev})
 * that take plain numbers / a `DocumentState`, so they are unit-/property-
 * testable without the store (tasks 11.6/11.7). {@link nextStep} /
 * {@link prevStep} are the thin store-driven wrappers the UI / keyboard handlers
 * call.
 */

import { useDocumentStore, useSessionStore } from '../state';
import type { DocumentState } from '../types';

/**
 * Clamp a Step index to the valid range for a Sequence of `length` Steps:
 * `[0, length - 1]`. An empty Sequence (`length === 0`) clamps to `0`, the only
 * sensible resting value when there is no Step to point at.
 */
export function clampStepIndex(index: number, length: number): number {
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
 * The index after advancing one Step from `current`, with end clamping: on the
 * last Step the index is unchanged (Req 8.5). `current` is first clamped into
 * range so a stale index cannot escape the bounds.
 */
export function nextStepIndex(current: number, length: number): number {
  const clamped = clampStepIndex(current, length);
  return clampStepIndex(clamped + 1, length);
}

/**
 * The index after stepping back one Step from `current`, with start clamping:
 * on the first Step the index is unchanged (Req 8.6).
 */
export function prevStepIndex(current: number, length: number): number {
  const clamped = clampStepIndex(current, length);
  return clampStepIndex(clamped - 1, length);
}

/** True when a next Step exists (not already on the last Step, Req 8.5). */
export function canNext(current: number, length: number): boolean {
  if (length <= 0) {
    return false;
  }
  return clampStepIndex(current, length) < length - 1;
}

/** True when a previous Step exists (not already on the first Step, Req 8.6). */
export function canPrev(current: number, length: number): boolean {
  if (length <= 0) {
    return false;
  }
  return clampStepIndex(current, length) > 0;
}

/** Current Sequence length read from the Document store. */
function sequenceLength(doc: DocumentState): number {
  return doc.sequence.length;
}

/**
 * Advance to the next Step, clamping at the last Step (Req 8.5). Session-state
 * change only — never recorded in undo history. No-op when already on the last
 * Step or when the Sequence is empty.
 */
export function nextStep(): void {
  const length = sequenceLength(useDocumentStore.getState());
  const session = useSessionStore.getState();
  session.setCurrentStepIndex(nextStepIndex(session.currentStepIndex, length));
}

/**
 * Step back to the previous Step, clamping at the first Step (Req 8.6).
 * Session-state change only — never recorded in undo history. No-op when
 * already on the first Step or when the Sequence is empty.
 */
export function prevStep(): void {
  const length = sequenceLength(useDocumentStore.getState());
  const session = useSessionStore.getState();
  session.setCurrentStepIndex(prevStepIndex(session.currentStepIndex, length));
}
