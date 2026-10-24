/**
 * Presentation_File serializer and validator (design "io/serializer.ts").
 *
 * `serialize` turns a {@link DocumentState} into a plain, JSON-serializable
 * {@link PresentationFile}: a format version, the PDF_Fingerprint, the
 * Focus_Areas, Notes, Image_Items (image data as data URLs), Crops (source
 * page index + source rect in PAGE coordinates, with NO rendered bitmap),
 * Connectors, the Sequence with speaker notes, the canvas-coordinate
 * positions/sizes of every item, the initial Camera, and ONLY the Kept_Ink
 * strokes (Req 9.2). It deliberately excludes the PDF file content, Crop
 * rendered bitmaps, and Discussion_Ink (Req 9.3, 9.13); Discussion_Ink lives
 * in SessionState and is never part of DocumentState, so it cannot leak in.
 *
 * `deserialize` validates an unknown value against the format version and the
 * data structure BEFORE producing a DocumentState (Req 9.4), returning a
 * discriminated {@link Result}. It rejects values that are not a JSON object,
 * carry an unsupported version, or fail structure validation (Req 9.10), and
 * specifically rejects any Kept_Ink stroke with an empty point array, a
 * non-finite coordinate, a pressure outside [0, 1], an invalid color, or a
 * non-positive width (Req 9.15).
 *
 * Both functions are pure and round-trippable (Req 9.11, tested in task 8.2).
 * File open/save dialogs and fingerprint reconciliation belong to task 8.6.
 */

import type {
  Camera,
  Connector,
  Crop,
  DocumentState,
  FocusArea,
  ImageItem,
  InkPoint,
  InkStroke,
  Note,
  PagePlacement,
  PdfFingerprint,
  RectCanvas,
  RectPage,
  Step,
} from '../types';

/**
 * Current Presentation_File schema version. `deserialize` accepts only this
 * version; anything else fails validation under Req 9.10.
 */
export const FORMAT_VERSION = 1;

/**
 * The on-disk shape of a Presentation_File. It mirrors the persisted subset of
 * {@link DocumentState}: a `version` discriminator plus the content fields.
 * Everything here is plain JSON (no class instances, no bitmaps).
 */
export interface PresentationFile {
  /** Format version; equals {@link FORMAT_VERSION} for files this build writes. */
  version: number;
  /** Identity of the PDF the presentation was authored against. */
  pdf: PdfFingerprint;
  /** Canvas-space placement of each page (derived from the layout). */
  pages: PagePlacement[];
  /** Highlighted Page regions (rect in PAGE coords + pageIndex). */
  focusAreas: FocusArea[];
  /** Text notes placed in canvas white space. */
  notes: Note[];
  /** Imported images (raster encoded as a data URL). */
  images: ImageItem[];
  /** Crops: source page index + source rect in PAGE coords + canvas rect. */
  crops: Crop[];
  /** Connectors between items. */
  connectors: Connector[];
  /** Ordered Sequence; each Step carries an optional speaker note. */
  sequence: Step[];
  /** Camera restored when the presentation is opened. */
  initialCamera: Camera;
  /** Kept_Ink strokes only; empty array when none (Req 9.2). */
  keptInk: InkStroke[];
}

/** A structured validation failure naming the specific problem (Req 9.10). */
export interface ValidationError {
  /** Stable machine-readable failure code. */
  code: ValidationErrorCode;
  /** Human-readable message naming the failure. */
  message: string;
}

/** Enumerated validation failure codes. */
export type ValidationErrorCode =
  | 'not-json-object'
  | 'unsupported-version'
  | 'structure-mismatch'
  | 'malformed-kept-ink';

/** A discriminated result: either a success value or a failure error. */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Serialize a {@link DocumentState} into a plain {@link PresentationFile}.
 *
 * The result is deep-copied field-by-field so the returned object shares no
 * mutable references with `state`, keeping the function pure. The format
 * version is forced to {@link FORMAT_VERSION} regardless of `state.version`.
 * `keptInk` already contains only Kept_Ink (Discussion_Ink is not part of
 * DocumentState), so no filtering by `kept` is required; it is copied verbatim
 * and defaults to an empty array when absent (Req 9.2).
 */
export function serialize(state: DocumentState): PresentationFile {
  return {
    version: FORMAT_VERSION,
    pdf: cloneFingerprint(state.pdf),
    pages: state.pages.map(clonePagePlacement),
    focusAreas: state.focusAreas.map(cloneFocusArea),
    notes: state.notes.map(cloneNote),
    images: state.images.map(cloneImage),
    crops: state.crops.map(cloneCrop),
    connectors: state.connectors.map(cloneConnector),
    sequence: state.sequence.map(cloneStep),
    initialCamera: cloneCamera(state.initialCamera),
    keptInk: (state.keptInk ?? []).map(cloneStroke),
  };
}

/**
 * Validate an unknown value and, on success, produce a {@link DocumentState}.
 *
 * Validation order (Req 9.4): the value must be a plain JSON object; its
 * `version` must equal {@link FORMAT_VERSION} (Req 9.10); every field must have
 * the expected structure (Req 9.10); and every Kept_Ink stroke must be
 * well-formed (Req 9.15). The returned DocumentState copies `version` through
 * from the file for round-trip fidelity.
 */
export function deserialize(
  json: unknown,
): Result<DocumentState, ValidationError> {
  if (!isPlainObject(json)) {
    return fail('not-json-object', 'Presentation file is not a JSON object.');
  }

  const version = (json as Record<string, unknown>).version;
  if (typeof version !== 'number' || version !== FORMAT_VERSION) {
    return fail(
      'unsupported-version',
      `Unsupported presentation format version: ${describe(version)}. ` +
        `Expected ${FORMAT_VERSION}.`,
    );
  }

  const obj = json as Record<string, unknown>;

  const pdf = parseFingerprint(obj.pdf);
  if (!pdf) return structureMismatch('pdf');

  const pages = parseArray(obj.pages, parsePagePlacement);
  if (!pages) return structureMismatch('pages');

  const focusAreas = parseArray(obj.focusAreas, parseFocusArea);
  if (!focusAreas) return structureMismatch('focusAreas');

  const notes = parseArray(obj.notes, parseNote);
  if (!notes) return structureMismatch('notes');

  const images = parseArray(obj.images, parseImage);
  if (!images) return structureMismatch('images');

  const crops = parseArray(obj.crops, parseCrop);
  if (!crops) return structureMismatch('crops');

  const connectors = parseArray(obj.connectors, parseConnector);
  if (!connectors) return structureMismatch('connectors');

  const sequence = parseArray(obj.sequence, parseStep);
  if (!sequence) return structureMismatch('sequence');

  const initialCamera = parseCamera(obj.initialCamera);
  if (!initialCamera) return structureMismatch('initialCamera');

  // Kept_Ink: structure first, then the per-stroke well-formedness of Req 9.15.
  if (!Array.isArray(obj.keptInk)) return structureMismatch('keptInk');
  const keptInk: InkStroke[] = [];
  for (let i = 0; i < obj.keptInk.length; i++) {
    const parsed = parseKeptStroke(obj.keptInk[i], i);
    if (!parsed.ok) return parsed;
    keptInk.push(parsed.value);
  }

  const value: DocumentState = {
    version,
    pdf,
    pages,
    focusAreas,
    notes,
    images,
    crops,
    connectors,
    sequence,
    initialCamera,
    keptInk,
  };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function fail(
  code: ValidationErrorCode,
  message: string,
): Result<never, ValidationError> {
  return { ok: false, error: { code, message } };
}

function structureMismatch(field: string): Result<never, ValidationError> {
  return fail(
    'structure-mismatch',
    `Presentation file field "${field}" is missing or has the wrong structure.`,
  );
}

// ---------------------------------------------------------------------------
// serialize: deep-copy helpers (no shared references with the input state)
// ---------------------------------------------------------------------------

function cloneFingerprint(f: PdfFingerprint): PdfFingerprint {
  return { fingerprint: f.fingerprint, pageCount: f.pageCount, title: f.title };
}

function cloneRectCanvas(r: RectCanvas): RectCanvas {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function cloneRectPage(r: RectPage): RectPage {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function cloneCamera(c: Camera): Camera {
  return { panX: c.panX, panY: c.panY, zoom: c.zoom };
}

function clonePagePlacement(p: PagePlacement): PagePlacement {
  return {
    pageIndex: p.pageIndex,
    rect: cloneRectCanvas(p.rect),
    pageWidth: p.pageWidth,
    pageHeight: p.pageHeight,
  };
}

function cloneFocusArea(a: FocusArea): FocusArea {
  return { id: a.id, pageIndex: a.pageIndex, rect: cloneRectPage(a.rect) };
}

function cloneNote(n: Note): Note {
  return { id: n.id, rect: cloneRectCanvas(n.rect), text: n.text };
}

function cloneImage(i: ImageItem): ImageItem {
  return { id: i.id, rect: cloneRectCanvas(i.rect), dataURL: i.dataURL };
}

function cloneCrop(c: Crop): Crop {
  return {
    id: c.id,
    sourcePageIndex: c.sourcePageIndex,
    sourceRect: cloneRectPage(c.sourceRect),
    rect: cloneRectCanvas(c.rect),
  };
}

function cloneConnector(c: Connector): Connector {
  return { id: c.id, fromItemId: c.fromItemId, toTargetId: c.toTargetId };
}

function cloneStep(s: Step): Step {
  const step: Step = { id: s.id, itemId: s.itemId };
  if (s.speakerNote !== undefined) step.speakerNote = s.speakerNote;
  return step;
}

function clonePoint(p: InkPoint): InkPoint {
  return { x: p.x, y: p.y, pressure: p.pressure };
}

function cloneStroke(s: InkStroke): InkStroke {
  return {
    points: s.points.map(clonePoint),
    color: s.color,
    width: s.width,
    kept: s.kept,
  };
}

// ---------------------------------------------------------------------------
// deserialize: structural parsers. Each returns the typed value on success or
// `null`/`undefined` on a structure mismatch so callers can report the field.
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * Parse an array by applying `parseItem` to each element. Returns `null` if the
 * value is not an array or any element fails to parse.
 */
function parseArray<T>(
  v: unknown,
  parseItem: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const parsed = parseItem(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseRectCanvas(v: unknown): RectCanvas | null {
  if (!isPlainObject(v)) return null;
  if (
    !isFiniteNumber(v.x) ||
    !isFiniteNumber(v.y) ||
    !isFiniteNumber(v.width) ||
    !isFiniteNumber(v.height)
  ) {
    return null;
  }
  return { x: v.x, y: v.y, width: v.width, height: v.height };
}

// RectPage is structurally identical to RectCanvas.
const parseRectPage = parseRectCanvas as (v: unknown) => RectPage | null;

function parseFingerprint(v: unknown): PdfFingerprint | null {
  if (!isPlainObject(v)) return null;
  if (
    !isString(v.fingerprint) ||
    !isFiniteNumber(v.pageCount) ||
    !isString(v.title)
  ) {
    return null;
  }
  return {
    fingerprint: v.fingerprint,
    pageCount: v.pageCount,
    title: v.title,
  };
}

function parseCamera(v: unknown): Camera | null {
  if (!isPlainObject(v)) return null;
  if (
    !isFiniteNumber(v.panX) ||
    !isFiniteNumber(v.panY) ||
    !isFiniteNumber(v.zoom)
  ) {
    return null;
  }
  return { panX: v.panX, panY: v.panY, zoom: v.zoom };
}

function parsePagePlacement(v: unknown): PagePlacement | null {
  if (!isPlainObject(v)) return null;
  const rect = parseRectCanvas(v.rect);
  if (
    !isFiniteNumber(v.pageIndex) ||
    rect === null ||
    !isFiniteNumber(v.pageWidth) ||
    !isFiniteNumber(v.pageHeight)
  ) {
    return null;
  }
  return {
    pageIndex: v.pageIndex,
    rect,
    pageWidth: v.pageWidth,
    pageHeight: v.pageHeight,
  };
}

function parseFocusArea(v: unknown): FocusArea | null {
  if (!isPlainObject(v)) return null;
  const rect = parseRectPage(v.rect);
  if (!isString(v.id) || !isFiniteNumber(v.pageIndex) || rect === null) {
    return null;
  }
  return { id: v.id, pageIndex: v.pageIndex, rect };
}

function parseNote(v: unknown): Note | null {
  if (!isPlainObject(v)) return null;
  const rect = parseRectCanvas(v.rect);
  if (!isString(v.id) || rect === null || !isString(v.text)) return null;
  return { id: v.id, rect, text: v.text };
}

function parseImage(v: unknown): ImageItem | null {
  if (!isPlainObject(v)) return null;
  const rect = parseRectCanvas(v.rect);
  if (!isString(v.id) || rect === null || !isString(v.dataURL)) return null;
  return { id: v.id, rect, dataURL: v.dataURL };
}

function parseCrop(v: unknown): Crop | null {
  if (!isPlainObject(v)) return null;
  const sourceRect = parseRectPage(v.sourceRect);
  const rect = parseRectCanvas(v.rect);
  if (
    !isString(v.id) ||
    !isFiniteNumber(v.sourcePageIndex) ||
    sourceRect === null ||
    rect === null
  ) {
    return null;
  }
  return {
    id: v.id,
    sourcePageIndex: v.sourcePageIndex,
    sourceRect,
    rect,
  };
}

function parseConnector(v: unknown): Connector | null {
  if (!isPlainObject(v)) return null;
  if (!isString(v.id) || !isString(v.fromItemId) || !isString(v.toTargetId)) {
    return null;
  }
  return { id: v.id, fromItemId: v.fromItemId, toTargetId: v.toTargetId };
}

function parseStep(v: unknown): Step | null {
  if (!isPlainObject(v)) return null;
  if (!isString(v.id) || !isString(v.itemId)) return null;
  // speakerNote is optional; when present it must be a string.
  if (v.speakerNote !== undefined && !isString(v.speakerNote)) return null;
  const step: Step = { id: v.id, itemId: v.itemId };
  if (v.speakerNote !== undefined) step.speakerNote = v.speakerNote;
  return step;
}

// ---------------------------------------------------------------------------
// deserialize: Kept_Ink validation (Req 9.15)
// ---------------------------------------------------------------------------

/**
 * Parse and validate a single Kept_Ink stroke. On a structural problem returns
 * a `structure-mismatch`; on a Req 9.15 violation (empty points, non-finite
 * coordinate, pressure outside [0, 1], invalid color, or non-positive width)
 * returns a `malformed-kept-ink` error naming the offending stroke.
 */
function parseKeptStroke(
  v: unknown,
  index: number,
): Result<InkStroke, ValidationError> {
  if (!isPlainObject(v)) {
    return structureMismatch(`keptInk[${index}]`);
  }

  const { points, color, width } = v;

  if (!Array.isArray(points)) {
    return structureMismatch(`keptInk[${index}].points`);
  }
  if (points.length === 0) {
    return malformedInk(index, 'has an empty point array');
  }

  const parsedPoints: InkPoint[] = [];
  for (let j = 0; j < points.length; j++) {
    const p = points[j];
    if (!isPlainObject(p)) {
      return structureMismatch(`keptInk[${index}].points[${j}]`);
    }
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      return malformedInk(
        index,
        `has a non-finite coordinate at point ${j}`,
      );
    }
    if (!isFiniteNumber(p.pressure) || p.pressure < 0 || p.pressure > 1) {
      return malformedInk(
        index,
        `has a pressure outside [0, 1] at point ${j}`,
      );
    }
    parsedPoints.push({ x: p.x, y: p.y, pressure: p.pressure });
  }

  if (!isValidColor(color)) {
    return malformedInk(index, 'has an invalid color');
  }
  if (!isFiniteNumber(width) || width <= 0) {
    return malformedInk(index, 'has a width that is not a positive number');
  }

  // `kept` is implied true for Kept_Ink in the file; normalize it to true so a
  // deserialized stroke round-trips as Kept_Ink even if the field is absent.
  return {
    ok: true,
    value: { points: parsedPoints, color, width, kept: true },
  };
}

function malformedInk(
  index: number,
  reason: string,
): Result<never, ValidationError> {
  return fail(
    'malformed-kept-ink',
    `Kept_Ink stroke ${index} ${reason}.`,
  );
}

/**
 * A color is valid when it is a non-empty, non-whitespace CSS color string.
 * Full CSS color parsing requires a DOM, which this pure validator avoids; the
 * check rejects the clearly-invalid cases (empty/blank/non-string) called out
 * by Req 9.15 while keeping serialize/deserialize usable without a browser.
 */
function isValidColor(v: unknown): v is string {
  return isString(v) && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

/** Render an unknown value for an error message without throwing. */
function describe(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undefined';
  return String(v);
}
