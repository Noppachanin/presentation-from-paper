/**
 * "Clear ink" default action (task 14.2, Req 14.18 / Req 11.8).
 *
 * The Ink_Palette exposes a clear-ink control. The palette itself is
 * presentational and takes an `onClearInk` callback (task 15.1 wires the full
 * removal, including transient Discussion_Ink). So the UI stays usable on its
 * own, this module provides a sensible default the palette falls back to when
 * no callback is supplied.
 *
 * ## What the default does
 * It records the removal of all Kept_Ink as a single undo unit via the history
 * store's `recordEdit` (Req 11.8: "clear ink" is one editing action). Kept_Ink
 * is the persisted ink in `DocumentState`, so it goes through history. The
 * transient Discussion_Ink lives in the Session store and is removed by task
 * 15.1's wiring (it is excluded from the Presentation_File and, when removed by
 * the Ink_Clear_Policy, excluded from history — Req 11.9); the default here
 * deliberately scopes itself to the undoable Kept_Ink so it is correct and
 * reversible even before 15.1 lands.
 */

import { useHistoryStore } from '../state';

/**
 * Clear all Kept_Ink, recorded as one undoable action (Req 14.18, Req 11.8).
 * The default behaviour of the Ink_Palette's clear-ink control when no
 * `onClearInk` prop is provided.
 */
export function clearKeptInk(): void {
  useHistoryStore.getState().recordEdit('clear ink', (draft) => {
    draft.keptInk = [];
  });
}
