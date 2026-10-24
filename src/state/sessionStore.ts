/**
 * The Session store (transient state).
 *
 * Holds everything that is NOT persisted to a Presentation_File: the current
 * mode, the active tool, Discussion_Ink, the ink settings, the reduce-motion
 * flag, the `currentStepIndex`, the unsaved-changes `dirty` flag, and — kept
 * here deliberately — the live Camera.
 *
 * ## Live Camera (Req 11.5)
 * The design keeps the live Camera in the store so every layer follows the
 * Camera in a single frame during a transition. It lives in the *session*
 * store, separate from the undoable `DocumentState`, precisely because Camera
 * moves must be excluded from the undo history. (That exclusion is enforced by
 * the command stack in task 10.2; here we just keep the Camera in transient
 * live state so it is never part of a document snapshot.)
 *
 * ## dirty flag (Req 9.12)
 * `dirty` is the unsaved-changes guard flag. Document-mutating actions set it
 * (see documentStore.ts); the Serializer / load path clears it. The actual
 * `beforeunload` / confirm wiring is task 15.1 — this store only maintains and
 * exposes the flag.
 *
 * ## currentStepIndex
 * The index of the current Step in the Sequence. Only the field + a setter live
 * here; the navigation actions that clamp and move it come in task 11.5.
 *
 * All updates go through Immer (zustand's `immer` middleware).
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Camera, InkClearPolicy, SessionState, Tool } from '../types';

/** The Camera a session starts at before any document is opened. */
const DEFAULT_CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 };

/** Default fade-out delay in seconds (Req 14.20; range 1..30). */
export const DEFAULT_FADE_DELAY_SECONDS = 5;

/**
 * The live Camera. Transient, excluded from undo history and from the
 * Presentation_File — see the file header.
 */
export interface LiveCameraState {
  /** The current on-screen Camera, shared by every layer. */
  camera: Camera;
}

/** Transient session state plus the live Camera. */
export type SessionStoreState = SessionState & LiveCameraState;

/** Actions exposed by the Session store. */
export interface SessionActions {
  /** Switch between Edit_Mode and Present_Mode. */
  setMode: (mode: SessionState['mode']) => void;
  /** Select the active tool. */
  setActiveTool: (tool: Tool) => void;
  /** Toggle whether newly drawn strokes become Kept_Ink. */
  setKeepInkToggle: (keep: boolean) => void;
  /** Choose how Discussion_Ink is cleared. */
  setInkClearPolicy: (policy: InkClearPolicy) => void;
  /** Set the fade-out delay (seconds). */
  setFadeDelaySeconds: (seconds: number) => void;
  /** Set the reduce-motion flag (instant Camera transitions when true). */
  setReduceMotion: (reduceMotion: boolean) => void;
  /** Set the index of the current Step (navigation clamping is task 11.5). */
  setCurrentStepIndex: (index: number) => void;
  /** Set or clear the unsaved-changes guard flag (Req 9.12). */
  setDirty: (dirty: boolean) => void;
  /** Replace the live Camera (Req 11.5; never recorded in undo history). */
  setCamera: (camera: Camera) => void;
  /** Reset the session to its defaults (does not reset the live Camera unless asked). */
  reset: () => void;
}

/** The Session store value: transient state + live Camera + actions. */
export type SessionStore = SessionStoreState & SessionActions;

/** The default transient session state (Req 14.19, 14.20, 14.23/14.24). */
export function createDefaultSession(): SessionStoreState {
  return {
    mode: 'edit',
    activeTool: 'pan',
    discussionInk: [],
    keepInkToggle: false,
    inkClearPolicy: 'keep-until-cleared',
    fadeDelaySeconds: DEFAULT_FADE_DELAY_SECONDS,
    reduceMotion: false,
    currentStepIndex: 0,
    dirty: false,
    camera: { ...DEFAULT_CAMERA },
  };
}

/**
 * The Session store. Use the typed selector hook directly in components, e.g.
 * `const mode = useSessionStore((s) => s.mode)`.
 */
export const useSessionStore = create<SessionStore>()(
  immer((set) => ({
    ...createDefaultSession(),

    setMode: (mode) => {
      set((state) => {
        state.mode = mode;
      });
    },

    setActiveTool: (tool) => {
      set((state) => {
        state.activeTool = tool;
      });
    },

    setKeepInkToggle: (keep) => {
      set((state) => {
        state.keepInkToggle = keep;
      });
    },

    setInkClearPolicy: (policy) => {
      set((state) => {
        state.inkClearPolicy = policy;
      });
    },

    setFadeDelaySeconds: (seconds) => {
      set((state) => {
        state.fadeDelaySeconds = seconds;
      });
    },

    setReduceMotion: (reduceMotion) => {
      set((state) => {
        state.reduceMotion = reduceMotion;
      });
    },

    setCurrentStepIndex: (index) => {
      set((state) => {
        state.currentStepIndex = index;
      });
    },

    setDirty: (dirty) => {
      set((state) => {
        state.dirty = dirty;
      });
    },

    setCamera: (camera) => {
      set((state) => {
        state.camera = camera;
      });
    },

    reset: () => {
      set((state) => {
        Object.assign(state, createDefaultSession());
      });
    },
  })),
);
