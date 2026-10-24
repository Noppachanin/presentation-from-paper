/**
 * PDF identity types. The fingerprint lets the Serializer warn when a
 * Presentation_File is loaded against a different PDF (design "PDF_Fingerprint").
 */

/**
 * Identity of a loaded PDF: PDF.js document fingerprint, page count, and title.
 * Stored in the Presentation_File and compared on load (Req 9.5-9.7).
 */
export interface PdfFingerprint {
  fingerprint: string;
  pageCount: number;
  title: string;
}
