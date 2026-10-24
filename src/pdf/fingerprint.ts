/**
 * PDF_Fingerprint extraction and comparison (design "pdf/fingerprint.ts").
 *
 * A {@link PdfFingerprint} identifies a loaded PDF by its PDF.js document
 * fingerprint, its page count, and its title. The fingerprint is stored in the
 * Presentation_File so that, when the file is loaded later, the Application can
 * compare it against the PDF the user re-opens and warn on a mismatch
 * (Req 9.5, 9.6, 9.7).
 *
 * The {@link compareFingerprint} decision is a PURE function so it is testable
 * without a real PDF. The extraction helper ({@link extractFingerprint}) is a
 * small async wrapper around a PDF.js `PDFDocumentProxy`; it does NOT load a
 * PDF (that is task 4.7).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfFingerprint } from '../types';

/**
 * The result of comparing a stored PDF_Fingerprint against the one derived from
 * a freshly loaded PDF.
 *
 * - `'match'`: the PDF.js fingerprint and page count both agree.
 * - `'fingerprint-mismatch'`: the PDF.js fingerprints differ (Req 9.6).
 * - `'page-count-mismatch'`: the fingerprints agree but the page counts differ
 *   (Req 9.7).
 */
export type FingerprintComparison =
  | 'match'
  | 'fingerprint-mismatch'
  | 'page-count-mismatch';

/**
 * Extract the {@link PdfFingerprint} from an already-loaded PDF.js document.
 *
 * The PDF.js fingerprint is taken from the document's `fingerprints` array
 * (modern build v4 exposes `[primary, secondary?]`; we use the primary entry).
 * The page count comes from `numPages`, and the title from the document
 * metadata (`info.Title`), falling back to an empty string when metadata is
 * missing, has no title, or cannot be read.
 *
 * This is deliberately a small async helper over a `PDFDocumentProxy`; it does
 * not open or parse a PDF itself (that is the PDF_Loader, task 4.7).
 *
 * @param doc A loaded PDF.js document proxy.
 * @returns The extracted fingerprint identity for `doc`.
 */
export async function extractFingerprint(
  doc: PDFDocumentProxy,
): Promise<PdfFingerprint> {
  // `fingerprints` is a tuple `[string, string | null]` in the modern build;
  // the first entry is the primary document fingerprint. Guard defensively in
  // case a future/older build exposes it differently.
  const fingerprint = doc.fingerprints?.[0] ?? '';

  const pageCount = doc.numPages;

  let title = '';
  try {
    const metadata = await doc.getMetadata();
    const rawTitle = (metadata.info as { Title?: unknown } | undefined)?.Title;
    if (typeof rawTitle === 'string') {
      title = rawTitle;
    }
  } catch {
    // Metadata is optional; a document without readable metadata simply has no
    // title. Leave `title` as the empty-string fallback.
    title = '';
  }

  return { fingerprint, pageCount, title };
}

/**
 * Compare a stored PDF_Fingerprint against the one derived from the PDF the
 * user re-opened. PURE: depends only on its arguments and has no side effects,
 * so it is testable without a real PDF.
 *
 * Decision precedence (Req 9.6 before 9.7):
 * 1. If the PDF.js fingerprints differ, return `'fingerprint-mismatch'`.
 * 2. Otherwise, if the page counts differ, return `'page-count-mismatch'`.
 * 3. Otherwise, return `'match'`.
 *
 * The title is identifying metadata only and is NOT part of the decision; two
 * PDFs with the same fingerprint and page count but different titles still
 * `'match'`.
 *
 * @param stored The PDF_Fingerprint saved in the Presentation_File.
 * @param loaded The PDF_Fingerprint of the PDF the user selected on load.
 * @returns The comparison outcome.
 */
export function compareFingerprint(
  stored: PdfFingerprint,
  loaded: PdfFingerprint,
): FingerprintComparison {
  if (stored.fingerprint !== loaded.fingerprint) {
    return 'fingerprint-mismatch';
  }
  if (stored.pageCount !== loaded.pageCount) {
    return 'page-count-mismatch';
  }
  return 'match';
}
