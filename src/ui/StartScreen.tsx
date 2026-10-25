/**
 * The start screen (task 14.1, Req 10.7).
 *
 * Shown before any PDF is open. It offers the two entry points the Application
 * must provide on startup: open a PDF, or load a saved Presentation_File (which
 * then prompts for its PDF). Both controls hand back a `File` through callbacks;
 * the open / parse / reconcile orchestration is task 15.1.
 *
 * Presentational and self-contained: it holds no state and performs no side
 * effects beyond opening the native file picker.
 */

import { useRef } from 'react';

export interface StartScreenProps {
  /** Called with the chosen PDF file (Req 10.7, 1.1). */
  readonly onOpenPdf: (file: File) => void;
  /** Called with the chosen Presentation_File (Req 10.7). */
  readonly onLoadPresentation: (file: File) => void;
}

const SCREEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
  background: '#f9fafb',
  fontFamily: 'system-ui, sans-serif',
  color: '#111827',
  textAlign: 'center',
  padding: 24,
};

const CTA_STYLE: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 6,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#ffffff',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 15,
};

const SECONDARY_STYLE: React.CSSProperties = {
  ...CTA_STYLE,
  background: '#ffffff',
  color: '#2563eb',
};

/** The pre-open start screen with "Open PDF" and "Load presentation" (Req 10.7). */
export function StartScreen(props: StartScreenProps) {
  const { onOpenPdf, onLoadPresentation } = props;
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const pickFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    handler: (file: File) => void,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      handler(file);
    }
  };

  return (
    <div className="start-screen" style={SCREEN_STYLE}>
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>PDF Presentation Canvas</h1>
        <p style={{ margin: 0, color: '#6b7280', maxWidth: 420 }}>
          Open a PDF to start building a presentation, or load a saved
          presentation file. Everything stays in your browser.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => pickFile(e, onOpenPdf)}
        />
        <button
          type="button"
          className="start-screen__open-pdf"
          style={CTA_STYLE}
          onClick={() => pdfInputRef.current?.click()}
        >
          Open a PDF
        </button>

        <input
          ref={loadInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => pickFile(e, onLoadPresentation)}
        />
        <button
          type="button"
          className="start-screen__load"
          style={SECONDARY_STYLE}
          onClick={() => loadInputRef.current?.click()}
        >
          Load a presentation
        </button>
      </div>
    </div>
  );
}
