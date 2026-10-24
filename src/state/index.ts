/**
 * State store barrel.
 *
 * Zustand + Immer stores for the application: the persisted Document store and
 * the transient Session store (which also holds the live Camera). The undo/redo
 * history command stack is added in task 10.2. Import from `../state` (or
 * `@/state`) rather than the individual files so the module layout can change
 * without touching call sites.
 */

export {
  useDocumentStore,
  createEmptyDocument,
  DOCUMENT_VERSION,
} from './documentStore';
export type { DocumentStore, DocumentActions } from './documentStore';

export {
  useSessionStore,
  createDefaultSession,
  DEFAULT_FADE_DELAY_SECONDS,
} from './sessionStore';
export type {
  SessionStore,
  SessionActions,
  SessionStoreState,
  LiveCameraState,
} from './sessionStore';

export {
  useHistoryStore,
  CommandStack,
  HISTORY_CAPACITY,
} from './history';
export type {
  HistoryStore,
  HistoryState,
  HistoryActions,
  Command,
} from './history';
