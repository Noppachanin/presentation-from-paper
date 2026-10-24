/**
 * Browser file open/save for Presentation_Files (design "io", task 8.6).
 *
 * This module provides the browser trigger for saving (Req 9.1) and the file
 * read for opening (Req 9.5) a Presentation_File. It deliberately uses ONLY the
 * file input element and the download link, never the File System Access API
 * (Req 15.3), so it runs in Supported_Safari.
 *
 * The serialization/validation logic itself lives in {@link ./serializer} and
 * is NOT duplicated here: {@link buildPresentationBlob} calls `serialize` and
 * {@link parsePresentationText} calls `deserialize`. The pure parts (building
 * the blob payload, parsing text) are split from the thin DOM wrappers
 * ({@link triggerDownload}, {@link readFileAsText}) so the pure parts can be
 * imported and unit-tested without a DOM.
 */

import type { DocumentState } from '../types';
import {
  deserialize,
  serialize,
  type PresentationFile,
  type Result,
  type ValidationError,
} from './serializer';

/** Default filename used when the caller does not supply one. */
export const DEFAULT_PRESENTATION_FILENAME = 'presentation.json';

/** The MIME type used for the download Blob. */
const PRESENTATION_MIME_TYPE = 'application/json';

/**
 * The payload for a Presentation_File download: the serialized JSON text plus
 * the filename to offer the user. PURE — no DOM, no side effects — so it can be
 * built and asserted in tests.
 */
export interface PresentationBlobPayload {
  /** The serialized Presentation_File as pretty-printed JSON text. */
  text: string;
  /** The MIME type to use for the Blob. */
  mimeType: string;
  /** The filename to offer in the download. */
  filename: string;
}

/**
 * Build the JSON payload for a Presentation_File download from a
 * {@link DocumentState}. PURE: it runs the {@link serialize} logic from task
 * 8.1 (unchanged) and stringifies the result; it does not touch the DOM.
 *
 * @param state The document state to persist.
 * @param filename Optional download filename; defaults to
 *   {@link DEFAULT_PRESENTATION_FILENAME}.
 * @returns The text, MIME type, and filename for the download.
 */
export function buildPresentationBlob(
  state: DocumentState,
  filename: string = DEFAULT_PRESENTATION_FILENAME,
): PresentationBlobPayload {
  const file: PresentationFile = serialize(state);
  const text = JSON.stringify(file, null, 2);
  return { text, mimeType: PRESENTATION_MIME_TYPE, filename };
}

/**
 * Parse Presentation_File text into a {@link DocumentState}. PURE: it parses
 * JSON (reporting a `not-json-object` style failure on malformed JSON) and runs
 * {@link deserialize} (Req 9.4, 9.10, 9.15). No DOM access.
 *
 * Invalid JSON is mapped onto the same `ValidationError` shape `deserialize`
 * uses, so callers handle a single failure channel (Req 9.10).
 *
 * @param text The raw text read from a selected file.
 * @returns A {@link Result} with the DocumentState or a {@link ValidationError}.
 */
export function parsePresentationText(
  text: string,
): Result<DocumentState, ValidationError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: {
        code: 'not-json-object',
        message: 'Presentation file is not valid JSON.',
      },
    };
  }
  return deserialize(json);
}

// ---------------------------------------------------------------------------
// Thin DOM wrappers. These are the only browser-dependent parts of the module;
// they are guarded so importing this file in a non-DOM test does not throw.
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of `payload` using a temporary `<a download>`
 * element and an object URL (Req 9.1, 15.3 — no File System Access API).
 *
 * The anchor is created, clicked, and removed synchronously; the object URL is
 * revoked afterwards to release memory. Throws if no DOM is available.
 *
 * @param payload The blob payload from {@link buildPresentationBlob}.
 * @param doc The document to use (defaults to the global `document`); injectable
 *   for testing.
 */
export function triggerDownload(
  payload: PresentationBlobPayload,
  doc: Document = globalThis.document,
): void {
  if (!doc || typeof doc.createElement !== 'function') {
    throw new Error('triggerDownload requires a DOM document.');
  }

  const blob = new Blob([payload.text], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = payload.filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    anchor.click();
    doc.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Serialize `state` and trigger a browser download of the Presentation_File
 * (Req 9.1). Convenience wrapper combining {@link buildPresentationBlob} and
 * {@link triggerDownload}.
 *
 * @param state The document state to save.
 * @param filename Optional download filename.
 * @param doc Injectable document (defaults to the global `document`).
 */
export function savePresentation(
  state: DocumentState,
  filename?: string,
  doc: Document = globalThis.document,
): void {
  triggerDownload(buildPresentationBlob(state, filename), doc);
}

/**
 * Read a picked {@link File} as text. Thin wrapper over `File.text()` with a
 * `FileReader` fallback for environments whose `File` lacks `text()`. Does not
 * parse or validate — that is {@link parsePresentationText}.
 *
 * @param file The file selected via the file input element (Req 15.3).
 * @returns The file's text content.
 */
export async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/**
 * Open and validate a Presentation_File selected via the file input (Req 9.5).
 * Reads the file as text and runs {@link parsePresentationText}, so the result
 * carries either a {@link DocumentState} or a {@link ValidationError} describing
 * why the file was rejected (Req 9.4, 9.10, 9.15). Loading the PDF itself and
 * the fingerprint reconciliation are separate (see {@link ./reconcile}).
 *
 * @param file The selected Presentation_File.
 * @returns A {@link Result} with the parsed DocumentState or a validation error.
 */
export async function loadPresentationFile(
  file: File,
): Promise<Result<DocumentState, ValidationError>> {
  const text = await readFileAsText(file);
  return parsePresentationText(text);
}
