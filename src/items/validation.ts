/**
 * Image validation for Image_Item creation (Req 4.9, 4.10).
 *
 * The rules the Application must enforce when the user pastes or uploads an
 * image:
 *  - Only raster types PNG, JPEG, GIF, and WebP are accepted. Anything else is
 *    rejected and the Canvas is left unchanged (Req 4.9).
 *  - A file larger than 5 MB is accepted only after the user confirms, and the
 *    warning must name the file size and its Presentation_File-size impact
 *    (Req 4.10).
 *
 * This module is deliberately UI-free: it returns a typed result the UI (task
 * 14) acts on, rather than opening a dialog itself. That keeps the decision
 * logic pure and unit-testable and leaves presentation to the chrome layer.
 */

/** The MIME types accepted for an Image_Item (Req 4.9). */
export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

/** A supported raster image MIME type. */
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** Size threshold (bytes) above which an upload needs user confirmation (Req 4.10). */
export const IMAGE_SIZE_WARNING_BYTES = 5 * 1024 * 1024;

/**
 * The outcome of validating an image before creating an Image_Item.
 *
 *  - `ok`: the type is supported and the size is within the limit — create the
 *    item without prompting.
 *  - `needs-confirmation`: the type is supported but the file exceeds 5 MB —
 *    the UI must warn (naming `sizeBytes` and the file-size impact) and create
 *    the item only after the user confirms (Req 4.10).
 *  - `unsupported-type`: the type is not an accepted raster type — the UI shows
 *    an error and leaves the Canvas unchanged (Req 4.9).
 */
export type ImageValidationResult =
  | { readonly kind: 'ok'; readonly type: SupportedImageType; readonly sizeBytes: number }
  | {
      readonly kind: 'needs-confirmation';
      readonly type: SupportedImageType;
      readonly sizeBytes: number;
    }
  | { readonly kind: 'unsupported-type'; readonly type: string };

/** Whether `type` is one of the supported raster image MIME types (Req 4.9). */
export function isSupportedImageType(type: string): type is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Validate an image's MIME type and byte size before creating an Image_Item.
 *
 * Returns a typed {@link ImageValidationResult} the UI acts on; it never throws
 * and never mutates state. The caller supplies the reported MIME `type` and the
 * `sizeBytes` (e.g. from a `File`/`Blob`).
 */
export function validateImage(type: string, sizeBytes: number): ImageValidationResult {
  if (!isSupportedImageType(type)) {
    return { kind: 'unsupported-type', type };
  }
  if (sizeBytes > IMAGE_SIZE_WARNING_BYTES) {
    return { kind: 'needs-confirmation', type, sizeBytes };
  }
  return { kind: 'ok', type, sizeBytes };
}
