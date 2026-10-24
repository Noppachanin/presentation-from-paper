/**
 * Items module barrel.
 *
 * Focus_Area, Note, Image_Item, Crop, and Connector logic (task 11.1). Two
 * layers are exported:
 *
 *  - **Pure recipes** (`itemOperations`, `connectorOperations`): functions over
 *    an Immer draft of `DocumentState` with no store/DOM dependency. These are
 *    what the property/unit tests (tasks 11.2–11.4) drive directly, and what
 *    the Sequence model (task 11.5) reuses — notably {@link appendStep}.
 *  - **Store actions** (`itemActions`): thin wrappers that apply one recipe per
 *    user action through the history store, so each action is a single undo
 *    unit. The UI (task 14) calls these.
 *  - **Validation** (`validation`): image type/size checks returning a typed
 *    result the UI acts on (Req 4.9, 4.10).
 *
 * Import from `../items` (or `@/items`) rather than the individual files.
 */

// Id helper
export { newId } from './ids';

// Image validation (Req 4.9, 4.10)
export {
  SUPPORTED_IMAGE_TYPES,
  IMAGE_SIZE_WARNING_BYTES,
  isSupportedImageType,
  validateImage,
} from './validation';
export type { ImageValidationResult, SupportedImageType } from './validation';

// Pure item recipes (Req 3.1–3.6, 4.1–4.8)
export {
  MIN_FOCUS_SCREEN_PX,
  appendStep,
  createFocusArea,
  updateFocusAreaRect,
  deleteFocusArea,
  createNote,
  updateNoteText,
  createImageItem,
  createCrop,
  moveWhiteSpaceItem,
  resizeWhiteSpaceItem,
  deleteWhiteSpaceItem,
} from './itemOperations';

// Pure connector recipes (Req 5.1–5.5)
export {
  createConnector,
  deleteConnector,
  removeConnectorsReferencing,
  resolveTargetRect,
  computeConnectorEndpoints,
} from './connectorOperations';

// Store-facing actions (one history entry per action)
export {
  addFocusArea,
  setFocusAreaRect,
  removeFocusArea,
  addNote,
  setNoteText,
  addImageItem,
  addCrop,
  moveItem,
  resizeItem,
  removeWhiteSpaceItem,
  addConnector,
  removeConnector,
} from './itemActions';
