/**
 * The concrete dialogs for the UI chrome (task 14.1, Req 10.7):
 *
 *  - {@link OpenPdfDialog}        — pick a PDF to open (Req 10.7, 1.1).
 *  - {@link LoadPresentationDialog} — pick a Presentation_File to load (Req 10.7).
 *  - {@link MismatchDialog}       — PDF fingerprint / page-count mismatch warning,
 *                                   consuming the reconcile status (Req 9.6, 9.7, 9.8).
 *  - {@link ErrorDialog}          — a generic named-error dialog (Req 1.5, 9.4, 9.10).
 *  - {@link OversizedImageDialog} — confirm an image larger than 5 MB using the
 *                                   `validateImage` 'needs-confirmation' result
 *                                   (Req 4.10).
 *
 * All of these are **presentational**: visibility is owned by the parent, the
 * file inputs hand back a `File`, and every decision is reported through a
 * callback. The open / parse / reconcile orchestration that decides *when* to
 * show the mismatch or error dialogs is task 15.1 — these components just render
 * the right prompt for a given state and expose the right actions.
 */

import { useRef } from 'react';
import { SUPPORTED_IMAGE_TYPES } from '../items';
import type { ImageValidationResult } from '../items';
import type { FingerprintComparison } from '../pdf/fingerprint';
import { Dialog, DialogButton } from './Dialog';

/** Format a byte count as a short human-readable size (e.g. "6.2 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** A hidden file input plus a labelled button that opens the native picker. */
function FilePickerButton(props: {
  readonly accept: string;
  readonly label: string;
  readonly variant?: 'primary' | 'neutral';
  readonly onPick: (file: File) => void;
}) {
  const { accept, label, variant = 'primary', onPick } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so re-picking the same file fires `change` again.
          e.target.value = '';
          if (file) {
            onPick(file);
          }
        }}
      />
      <DialogButton variant={variant} onClick={() => inputRef.current?.click()}>
        {label}
      </DialogButton>
    </>
  );
}

// ---------------------------------------------------------------------------
// Open PDF
// ---------------------------------------------------------------------------

export interface OpenPdfDialogProps {
  readonly open: boolean;
  /** Called with the picked PDF file (Req 1.1). */
  readonly onOpenPdf: (file: File) => void;
  readonly onClose: () => void;
}

/** Pick a PDF file to open (Req 10.7, 1.1). */
export function OpenPdfDialog(props: OpenPdfDialogProps) {
  const { open, onOpenPdf, onClose } = props;
  return (
    <Dialog
      open={open}
      title="Open a PDF"
      onClose={onClose}
      footer={<DialogButton onClick={onClose}>Cancel</DialogButton>}
    >
      <p style={{ marginTop: 0 }}>
        Choose a PDF to open. It is read locally in your browser and never
        uploaded.
      </p>
      <FilePickerButton
        accept="application/pdf,.pdf"
        label={'Choose PDF\u2026'}
        onPick={(file) => onOpenPdf(file)}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Load Presentation
// ---------------------------------------------------------------------------

export interface LoadPresentationDialogProps {
  readonly open: boolean;
  /** Called with the picked Presentation_File (Req 10.7). */
  readonly onLoadPresentation: (file: File) => void;
  readonly onClose: () => void;
}

/** Pick a Presentation_File to load (Req 10.7). */
export function LoadPresentationDialog(props: LoadPresentationDialogProps) {
  const { open, onLoadPresentation, onClose } = props;
  return (
    <Dialog
      open={open}
      title="Load a presentation"
      onClose={onClose}
      footer={<DialogButton onClick={onClose}>Cancel</DialogButton>}
    >
      <p style={{ marginTop: 0 }}>
        Choose a saved presentation file. You will be asked to open its PDF if it
        is not already open.
      </p>
      <FilePickerButton
        accept="application/json,.json"
        label={'Choose presentation file\u2026'}
        onPick={(file) => onLoadPresentation(file)}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mismatch warning
// ---------------------------------------------------------------------------

export interface MismatchDialogProps {
  readonly open: boolean;
  /**
   * The reconcile status driving the warning. `'match'` is never shown (no
   * warning needed); a mismatch status selects the explanatory copy
   * (Req 9.6, 9.7).
   */
  readonly status: FingerprintComparison;
  /** Continue loading, clamping/discarding out-of-range items (Req 9.8). */
  readonly onContinue: () => void;
  /** Dismiss and choose a different PDF (Req 9.6, 9.7). */
  readonly onChooseDifferent: () => void;
  readonly onClose?: () => void;
}

const MISMATCH_COPY: Record<Exclude<FingerprintComparison, 'match'>, string> = {
  'fingerprint-mismatch':
    'The selected PDF does not match the one this presentation was created with. ' +
    'Continuing may move or discard focus areas and crops that no longer fit.',
  'page-count-mismatch':
    'The selected PDF has a different number of pages than this presentation was ' +
    'created with. Continuing will discard focus areas and crops on pages that no ' +
    'longer exist and clamp the rest.',
};

/** The PDF mismatch warning (Req 9.6, 9.7, 9.8). Consumes the reconcile status. */
export function MismatchDialog(props: MismatchDialogProps) {
  const { open, status, onContinue, onChooseDifferent, onClose } = props;
  if (status === 'match') {
    return null;
  }
  return (
    <Dialog
      open={open}
      title="PDF does not match"
      onClose={onClose}
      footer={
        <>
          <DialogButton variant="neutral" onClick={onChooseDifferent}>
            Choose different PDF
          </DialogButton>
          <DialogButton variant="primary" onClick={onContinue}>
            Continue anyway
          </DialogButton>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>{MISMATCH_COPY[status]}</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Generic error
// ---------------------------------------------------------------------------

export interface ErrorDialogProps {
  readonly open: boolean;
  /** Short error title (e.g. "Could not open PDF"). */
  readonly title?: string;
  /** The error detail message to show (Req 1.5, 9.4, 9.10). */
  readonly message: string;
  readonly onClose: () => void;
}

/** A generic named-error dialog (Req 1.5, 9.4, 9.10). */
export function ErrorDialog(props: ErrorDialogProps) {
  const { open, title = 'Something went wrong', message, onClose } = props;
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={<DialogButton variant="primary" onClick={onClose}>OK</DialogButton>}
    >
      <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Oversized-image confirm
// ---------------------------------------------------------------------------

export interface OversizedImageDialogProps {
  readonly open: boolean;
  /**
   * The validation result for the image being added. Only a
   * `'needs-confirmation'` result renders a prompt; any other result renders
   * nothing (the caller handles `ok` / `unsupported-type` elsewhere).
   */
  readonly result: ImageValidationResult;
  /** Add the oversized image anyway (Req 4.10). */
  readonly onConfirm: () => void;
  /** Cancel; leave the canvas unchanged (Req 4.10). */
  readonly onCancel: () => void;
}

/** Confirm adding an image larger than 5 MB (Req 4.10). */
export function OversizedImageDialog(props: OversizedImageDialogProps) {
  const { open, result, onConfirm, onCancel } = props;
  if (result.kind !== 'needs-confirmation') {
    return null;
  }
  const size = formatBytes(result.sizeBytes);
  return (
    <Dialog
      open={open}
      title="Large image"
      onClose={onCancel}
      footer={
        <>
          <DialogButton variant="neutral" onClick={onCancel}>
            Cancel
          </DialogButton>
          <DialogButton variant="primary" onClick={onConfirm}>
            Add anyway
          </DialogButton>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        This image is {size}, which is larger than 5&nbsp;MB. It will be embedded
        in your presentation file and increase its size by about {size}. Add it
        anyway?
      </p>
    </Dialog>
  );
}

/** Accepted image MIME types, exposed for a file-input `accept` attribute. */
export const IMAGE_ACCEPT = SUPPORTED_IMAGE_TYPES.join(',');
