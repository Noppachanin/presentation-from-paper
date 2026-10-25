/**
 * Global keyboard shortcuts for the app shell (task 15.1).
 *
 * Wires the document-level `keydown` handling the design leaves to the shell:
 *
 *  - **Undo / redo** (Req 11.1, 11.2) in BOTH modes (Req 11.10, 11.11):
 *    Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo. These drive the
 *    history store, which the toolbar and ink palette buttons also use.
 *  - **Present_Mode navigation** (Req 8.2, 8.3, 8.5, 8.6): Right / PageDown /
 *    Space step forward, Left / PageUp step back. The `onNext` / `onPrev`
 *    callbacks advance the Step AND animate the Camera (wired in the App), with
 *    end clamping already handled by `nextStep` / `prevStep`.
 *  - **Escape** exits Present_Mode back to Edit_Mode keeping the current Camera
 *    (Req 8.4) via `onExitPresent`.
 *
 * Typing into a Note (`contenteditable`) or a speaker-note `<textarea>` must not
 * trigger navigation or undo, so key events originating from an editable target
 * are ignored (except the always-safe Escape, which still exits Present_Mode).
 */

import { useEffect } from 'react';
import { useHistoryStore } from '../state';

/** Callbacks the keyboard layer drives. */
export interface KeyboardHandlers {
  /** Current application mode (navigation keys only act in Present_Mode). */
  mode: 'edit' | 'present';
  /** Advance one Step and animate the Camera (Req 8.2, 8.5). */
  onNext: () => void;
  /** Step back one Step and animate the Camera (Req 8.3, 8.6). */
  onPrev: () => void;
  /** Leave Present_Mode keeping the current Camera (Req 8.4). */
  onExitPresent: () => void;
  /** Report any navigation/activity so the step indicator can re-show. */
  onActivity?: () => void;
}

/** Whether the event target is an editable element that owns its own keys. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Attach the global keyboard shortcuts. The handlers are read through a ref-like
 * closure on every event by depending on them in the effect, so they always act
 * on the live mode without re-attaching on every render would still be correct;
 * we re-attach when the handlers change (cheap, one document listener).
 */
export function useKeyboard(handlers: KeyboardHandlers): void {
  const { mode, onNext, onPrev, onExitPresent, onActivity } = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;

      // Undo / redo work in both modes (Req 11.10, 11.11) and must not fire
      // while editing text.
      if (mod && !isEditableTarget(event.target)) {
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          useHistoryStore.getState().undo();
          return;
        }
        if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault();
          useHistoryStore.getState().redo();
          return;
        }
      }

      // Escape exits Present_Mode keeping the Camera (Req 8.4). Allowed even
      // from an editable target so the presenter can always bail out.
      if (event.key === 'Escape' && mode === 'present') {
        event.preventDefault();
        onExitPresent();
        return;
      }

      // Step navigation only in Present_Mode and never while editing text.
      if (mode !== 'present' || isEditableTarget(event.target)) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          onActivity?.();
          onNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          onActivity?.();
          onPrev();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, onNext, onPrev, onExitPresent, onActivity]);
}
