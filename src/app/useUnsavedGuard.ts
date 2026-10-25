/**
 * Unsaved-changes guard (task 15.1, Req 9.12).
 *
 * The Session store's `dirty` flag is set by every document-mutating action
 * (see state/documentStore.ts) and cleared by the save/load path. This hook
 * wires the two prompts the design leaves to the shell:
 *
 *  - A `beforeunload` listener that asks the browser to confirm a tab close /
 *    reload while `dirty` is true.
 *  - {@link confirmDiscardIfDirty}, a helper the App calls before loading
 *    another presentation while dirty, so the user confirms losing edits first.
 *
 * The `beforeunload` listener is only attached while dirty, so a clean session
 * never triggers the browser's leave prompt.
 */

import { useCallback, useEffect } from 'react';
import { useSessionStore } from '../state';

/** What {@link useUnsavedGuard} returns. */
export interface UnsavedGuard {
  /**
   * Whether it is safe to proceed with a destructive action (e.g. loading
   * another presentation). When the session is dirty it asks the user to
   * confirm; returns true only if they accept. Clean sessions return true
   * without prompting.
   */
  confirmDiscardIfDirty: (message?: string) => boolean;
}

const DEFAULT_CONFIRM =
  'You have unsaved changes that will be lost. Continue anyway?';

/** Attach the beforeunload guard and expose a confirm helper (Req 9.12). */
export function useUnsavedGuard(): UnsavedGuard {
  const dirty = useSessionStore((s) => s.dirty);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): string => {
      // The modern spec requires preventDefault + setting returnValue for the
      // browser to show its generic "leave site?" prompt.
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const confirmDiscardIfDirty = useCallback(
    (message: string = DEFAULT_CONFIRM): boolean => {
      if (!useSessionStore.getState().dirty) return true;
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
        return true;
      }
      return window.confirm(message);
    },
    [],
  );

  return { confirmDiscardIfDirty };
}
