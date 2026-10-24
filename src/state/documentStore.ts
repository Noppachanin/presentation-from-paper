/**
 * The Document store (persisted state).
 *
 * Holds the `DocumentState` that is serialized to a Presentation_File: the PDF
 * fingerprint, page placements, Focus_Areas, Notes, Image_Items, Crops,
 * Connectors, the ordered Sequence, the initial Camera, and Kept_Ink. All
 * mutations go through Immer (zustand's `immer` middleware) so updates stay
 * immutable with structural sharing — cheap snapshots for the undo/redo history
 * built in task 10.2.
 *
 * This task (10.1) provides only the store *shell*: replacing the whole
 * document (on load), setting the PDF fingerprint + pages (on PDF open), and a
 * generic Immer-based update escape hatch. The item/sequence mutation actions
 * (Focus_Areas, Notes, Crops, Connectors, Sequence navigation) are added by
 * tasks 11.1 / 11.5, so they are intentionally absent here.
 *
 * Every document-mutating action marks the Session store `dirty` so the
 * unsaved-changes guard (Req 9.12, wired in task 15.1) can prompt before a tab
 * close or loading another presentation.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Camera,
  DocumentState,
  PagePlacement,
  PdfFingerprint,
} from '../types';
import { useSessionStore } from './sessionStore';

/** The current Presentation_File schema version. */
export const DOCUMENT_VERSION = 1;

/** The Camera a freshly opened document restores to until one is authored. */
const DEFAULT_INITIAL_CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 };

/**
 * An empty `DocumentState`. Used as the initial store value and when no PDF has
 * been opened yet. `pdf` is a zeroed fingerprint; a real one replaces it the
 * moment a PDF is opened (`setPdf`).
 */
export function createEmptyDocument(): DocumentState {
  return {
    version: DOCUMENT_VERSION,
    pdf: { fingerprint: '', pageCount: 0, title: '' },
    pages: [],
    focusAreas: [],
    notes: [],
    images: [],
    crops: [],
    connectors: [],
    sequence: [],
    initialCamera: { ...DEFAULT_INITIAL_CAMERA },
    keptInk: [],
  };
}

/** Actions exposed by the Document store (shell only — see file header). */
export interface DocumentActions {
  /**
   * Replace the entire document, e.g. after loading a Presentation_File.
   * Clears the `dirty` flag because the loaded state is by definition saved.
   */
  replaceDocument: (doc: DocumentState) => void;
  /**
   * Set the PDF fingerprint and page placements when a PDF is opened. Leaves
   * authored items/sequence untouched (load-time reconciliation lives in task
   * 8.6 / 11.x). Marks the document dirty.
   */
  setPdf: (pdf: PdfFingerprint, pages: PagePlacement[]) => void;
  /** Replace only the page placements (e.g. on re-layout). Marks dirty. */
  setPages: (pages: PagePlacement[]) => void;
  /** Set the initial Camera restored when the presentation is opened. Marks dirty. */
  setInitialCamera: (camera: Camera) => void;
  /**
   * Generic Immer-based update escape hatch. The recipe mutates a draft of the
   * `DocumentState`; Immer produces the next immutable state. Marks the
   * document dirty. Item/sequence actions in task 11 build on this.
   */
  update: (recipe: (draft: DocumentState) => void) => void;
  /** Reset the store back to an empty document and clear the dirty flag. */
  reset: () => void;
}

/** The Document store value: persisted `DocumentState` plus its actions. */
export type DocumentStore = DocumentState & DocumentActions;

/** Mark the Session store dirty after a document-mutating action (Req 9.12). */
function markDirty(): void {
  useSessionStore.getState().setDirty(true);
}

/**
 * The Document store. Use the typed selector hook directly in components, e.g.
 * `const notes = useDocumentStore((s) => s.notes)`.
 */
export const useDocumentStore = create<DocumentStore>()(
  immer((set) => ({
    ...createEmptyDocument(),

    replaceDocument: (doc) => {
      set((state) => {
        Object.assign(state, doc);
      });
      // A freshly loaded document is, by definition, already saved.
      useSessionStore.getState().setDirty(false);
    },

    setPdf: (pdf, pages) => {
      set((state) => {
        state.pdf = pdf;
        state.pages = pages;
      });
      markDirty();
    },

    setPages: (pages) => {
      set((state) => {
        state.pages = pages;
      });
      markDirty();
    },

    setInitialCamera: (camera) => {
      set((state) => {
        state.initialCamera = camera;
      });
      markDirty();
    },

    update: (recipe) => {
      set((state) => {
        recipe(state);
      });
      markDirty();
    },

    reset: () => {
      set((state) => {
        Object.assign(state, createEmptyDocument());
      });
      useSessionStore.getState().setDirty(false);
    },
  })),
);
