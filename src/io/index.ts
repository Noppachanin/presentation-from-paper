/**
 * io service barrel.
 *
 * The Presentation_File serializer/validator, the browser file open/save
 * wrappers, load-time PDF_Fingerprint reconciliation, and the Present_Mode
 * URL-flag helper. Import from `../io` (or `@/io`) rather than the individual
 * files so the module layout can change without touching call sites.
 */

// Serializer + validation (task 8.1).
export {
  FORMAT_VERSION,
  serialize,
  deserialize,
} from './serializer';
export type {
  PresentationFile,
  ValidationError,
  ValidationErrorCode,
  Result,
} from './serializer';

// Browser file open/save (task 8.6).
export {
  DEFAULT_PRESENTATION_FILENAME,
  buildPresentationBlob,
  parsePresentationText,
  triggerDownload,
  savePresentation,
  readFileAsText,
  loadPresentationFile,
} from './fileIo';
export type { PresentationBlobPayload } from './fileIo';

// Load-time fingerprint reconciliation (task 8.6).
export { reconcile, reconcileOnContinue } from './reconcile';
export type {
  ReconcileResult,
  ReconcileOptions,
  ContinueReconciliation,
} from './reconcile';

// Present_Mode URL flag (task 8.6).
export { isPresentModeRequested } from './url';
