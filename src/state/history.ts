/**
 * Undo/redo history — the command stack (Req 11.1–11.9).
 *
 * The design calls for "a command stack of inverse-able editing commands,
 * capacity ≥ 50". This module models each recorded edit as an inverse-able
 * {@link Command}: a `before`/`after` pair of persisted {@link DocumentState}
 * snapshots. `undo` restores `before`; `redo` restores `after`.
 *
 * ## Why snapshots instead of per-field diffs
 * The Document store is driven by Immer, which gives immutable updates with
 * *structural sharing*: the parts of a `DocumentState` an edit does not touch
 * are shared by reference between the before and after values. So a snapshot is
 * effectively a handful of pointers, not a deep copy — holding 50+ of them is
 * cheap. That keeps every command genuinely inverse-able (restore the exact
 * prior object) without hand-writing an inverse for every kind of edit, which
 * is the pragmatic, reliable choice the design's "inverse-able command"
 * language allows.
 *
 * ## What is and isn't recorded
 * - Only the persisted `DocumentState` is ever captured. The live Camera lives
 *   in the Session store and is **never** part of a snapshot, so Camera moves
 *   are structurally excluded from history (Req 11.5).
 * - `recordEdit(label, recipe)` applies one Immer update to the document **and**
 *   pushes exactly one command — so one call == one undo unit. A finished ink
 *   stroke (Req 11.6), an entire eraser contact that removes many strokes
 *   (Req 11.7), and a "clear ink" that removes all ink (Req 11.8) each go
 *   through a single `recordEdit` call and therefore each form one entry.
 * - `applyWithoutHistory(recipe)` is the silent path for Ink_Clear_Policy
 *   auto-removals (fade-out / clear-on-step-change): it mutates the document
 *   without pushing a command, so policy-driven removals never enter history
 *   (Req 11.9).
 *
 * ## Capacity and redo clearing
 * The undo stack holds up to {@link HISTORY_CAPACITY} (≥ 50, Req 11.3)
 * commands; pushing past capacity drops the oldest. A new `recordEdit` after an
 * undo clears the redo stack (Req 11.4).
 *
 * ## Layering
 * The pure stack ({@link CommandStack}) is exported and has no React or Zustand
 * dependency, so tasks 10.3–10.5 can unit-test it directly. The
 * {@link useHistoryStore} Zustand store wires that stack to the Document store:
 * `recordEdit` / `undo` / `redo` write through
 * `useDocumentStore.getState().replaceDocument`, and expose reactive
 * `canUndo` / `canRedo` flags. Keyboard shortcuts (Ctrl+Z, …) are task 15.1 and
 * only consume the `undo` / `redo` functions exposed here.
 */

import { create } from 'zustand';
import type { DocumentState } from '../types';
import { useDocumentStore } from './documentStore';

/**
 * Maximum number of undo entries retained. At least 50 per Req 11.3; pushing a
 * command past this limit drops the oldest entry.
 */
export const HISTORY_CAPACITY = 50;

/**
 * One inverse-able editing action. `before` is the `DocumentState` prior to the
 * edit, `after` is the `DocumentState` once the edit is applied. Thanks to
 * Immer structural sharing these snapshots share all untouched substructure.
 */
export interface Command {
  /** Human-readable label for the action (e.g. "draw stroke", "clear ink"). */
  readonly label: string;
  /** Document snapshot before the edit — restored by `undo`. */
  readonly before: DocumentState;
  /** Document snapshot after the edit — restored by `redo`. */
  readonly after: DocumentState;
}

/**
 * A pure, framework-free undo/redo command stack. It stores commands only; it
 * does not know how to apply a `DocumentState` — the caller (the history store)
 * maps the `before` / `after` snapshots returned by `undo` / `redo` back onto
 * the Document store. Exported so it can be unit-tested without React.
 */
export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private readonly capacity: number = HISTORY_CAPACITY) {}

  /**
   * Record an already-applied edit. Pushes one command, clears the redo stack
   * (a new action after an undo discards redo — Req 11.4), and drops the oldest
   * entry when capacity is exceeded (Req 11.3).
   */
  push(command: Command): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift();
    }
    // A new recorded action invalidates any redo future.
    this.redoStack = [];
  }

  /**
   * Pop the most recent command and move it to the redo stack. Returns the
   * command whose `before` snapshot the caller should restore, or `undefined`
   * when there is nothing to undo.
   */
  undo(): Command | undefined {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return undefined;
    }
    this.redoStack.push(command);
    return command;
  }

  /**
   * Pop the most recently undone command and move it back to the undo stack.
   * Returns the command whose `after` snapshot the caller should restore, or
   * `undefined` when there is nothing to redo.
   */
  redo(): Command | undefined {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return undefined;
    }
    this.undoStack.push(command);
    return command;
  }

  /** True when there is at least one command to undo. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** True when there is at least one undone command to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Current number of undoable commands (for tests / diagnostics). */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Current number of redoable commands (for tests / diagnostics). */
  get redoDepth(): number {
    return this.redoStack.length;
  }

  /** Drop all history (e.g. after loading a new presentation). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/**
 * Snapshot the persisted document fields only — never the live Camera, which
 * lives in the Session store and must stay out of history (Req 11.5). The
 * `DocumentStore` value also carries action functions; we strip them so a
 * snapshot is plain, restorable state.
 */
function snapshotDocument(): DocumentState {
  const s = useDocumentStore.getState();
  // Immer gives us immutable, structurally-shared values; copying the field
  // references here is enough to freeze this point in time.
  return {
    version: s.version,
    pdf: s.pdf,
    pages: s.pages,
    focusAreas: s.focusAreas,
    notes: s.notes,
    images: s.images,
    crops: s.crops,
    connectors: s.connectors,
    sequence: s.sequence,
    initialCamera: s.initialCamera,
    keptInk: s.keptInk,
  };
}

/** Restore a document snapshot onto the Document store. */
function restoreDocument(doc: DocumentState): void {
  // `replaceDocument` overwrites the persisted fields and leaves the store's
  // action functions intact.
  useDocumentStore.getState().replaceDocument(doc);
}

/** The reactive surface of the history store. */
export interface HistoryState {
  /** True when `undo` would do something — reactive for toolbar buttons. */
  canUndo: boolean;
  /** True when `redo` would do something — reactive for toolbar buttons. */
  canRedo: boolean;
}

/** Actions exposed by the history store. */
export interface HistoryActions {
  /**
   * Apply one editing action to the Document store and record it as a single
   * undo unit (Req 11.6–11.8). `recipe` mutates an Immer draft of the
   * `DocumentState` exactly like `useDocumentStore.getState().update`. The
   * before/after snapshots around the mutation become one {@link Command}.
   *
   * Use this for every user-driven document edit — including one finished ink
   * stroke, one whole eraser contact, or one clear-ink — so each is one entry.
   */
  recordEdit: (label: string, recipe: (draft: DocumentState) => void) => void;
  /**
   * Mutate the document **without** recording history (Req 11.9). This is the
   * path for Ink_Clear_Policy auto-removals (fade-out / clear-on-step-change)
   * and any other change that must never appear in undo.
   */
  applyWithoutHistory: (recipe: (draft: DocumentState) => void) => void;
  /** Revert the most recent recorded action (Req 11.1). No-op when empty. */
  undo: () => void;
  /** Reapply the most recently reverted action (Req 11.2). No-op when empty. */
  redo: () => void;
  /** Imperative accessor mirroring the reactive `canUndo` flag. */
  canUndoNow: () => boolean;
  /** Imperative accessor mirroring the reactive `canRedo` flag. */
  canRedoNow: () => boolean;
  /** Clear all history (e.g. after loading a presentation). */
  clearHistory: () => void;
}

/** The history store value: reactive flags + actions. */
export type HistoryStore = HistoryState & HistoryActions;

/**
 * The history store. Holds the pure {@link CommandStack} in a closure and keeps
 * the reactive `canUndo` / `canRedo` flags in sync with it so React components
 * (the toolbar undo/redo buttons, Req 11.12) re-render when availability
 * changes. Import from `../state` rather than this file directly.
 */
export const useHistoryStore = create<HistoryStore>((set) => {
  const stack = new CommandStack(HISTORY_CAPACITY);

  /** Publish the stack's availability onto the reactive store. */
  const syncFlags = (): void => {
    set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() });
  };

  return {
    canUndo: false,
    canRedo: false,

    recordEdit: (label, recipe) => {
      const before = snapshotDocument();
      // Apply the edit through the Document store's own Immer update so the
      // `dirty` flag and structural sharing behave exactly as for any edit.
      useDocumentStore.getState().update(recipe);
      const after = snapshotDocument();
      stack.push({ label, before, after });
      syncFlags();
    },

    applyWithoutHistory: (recipe) => {
      // Silent path: mutate the document but record nothing (Req 11.9).
      useDocumentStore.getState().update(recipe);
    },

    undo: () => {
      const command = stack.undo();
      if (command === undefined) {
        return;
      }
      restoreDocument(command.before);
      syncFlags();
    },

    redo: () => {
      const command = stack.redo();
      if (command === undefined) {
        return;
      }
      restoreDocument(command.after);
      syncFlags();
    },

    canUndoNow: () => stack.canUndo(),
    canRedoNow: () => stack.canRedo(),

    clearHistory: () => {
      stack.clear();
      syncFlags();
    },
  };
});
