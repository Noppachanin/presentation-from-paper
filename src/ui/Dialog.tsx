/**
 * A minimal, presentational modal dialog shell used by every dialog in the UI
 * chrome (task 14.1).
 *
 * It renders a centred panel over a dimmed backdrop, traps nothing fancy (the
 * app shell owns focus/mode wiring in task 15.1), and is driven entirely by
 * props: `open`, a `title`, `children` for the body, and an optional `footer`
 * for action buttons. Closing is reported through `onClose` (backdrop click /
 * Escape) so the parent stays the single source of truth for visibility.
 *
 * Keeping the shell separate means the concrete dialogs (open PDF, load/save,
 * mismatch, error, oversized-image) only describe their content and actions.
 */

import { useEffect } from 'react';

export interface DialogProps {
  /** Whether the dialog is shown. When false, nothing is rendered. */
  readonly open: boolean;
  /** Dialog heading. */
  readonly title: string;
  /** Dialog body. */
  readonly children: React.ReactNode;
  /** Optional footer (action buttons). */
  readonly footer?: React.ReactNode;
  /**
   * Request to close (backdrop click or Escape). Optional: omit for a modal
   * that must be dismissed through an explicit action button only.
   */
  readonly onClose?: () => void;
}

const BACKDROP_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17, 24, 39, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  fontFamily: 'system-ui, sans-serif',
};

const PANEL_STYLE: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 8,
  minWidth: 320,
  maxWidth: 480,
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  overflow: 'hidden',
};

/** A dimmed-backdrop modal shell. Presentational; visibility owned by parent. */
export function Dialog(props: DialogProps) {
  const { open, title, children, footer, onClose } = props;

  // Close on Escape when a close handler is provided.
  useEffect(() => {
    if (!open || onClose === undefined) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="dialog__backdrop"
      style={BACKDROP_STYLE}
      onClick={() => onClose?.()}
    >
      <div
        className="dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="dialog__title"
          style={{
            margin: 0,
            padding: '12px 16px',
            fontSize: 15,
            borderBottom: '1px solid #e5e7eb',
            color: '#111827',
          }}
        >
          {title}
        </h2>
        <div className="dialog__body" style={{ padding: 16, fontSize: 13, color: '#374151' }}>
          {children}
        </div>
        {footer !== undefined && (
          <div
            className="dialog__footer"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '12px 16px',
              borderTop: '1px solid #e5e7eb',
              background: '#f9fafb',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A reusable dialog action button (primary / neutral / danger variants). */
export function DialogButton(props: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly variant?: 'primary' | 'neutral' | 'danger';
  readonly disabled?: boolean;
}) {
  const { children, onClick, variant = 'neutral', disabled } = props;
  const palette: Record<string, React.CSSProperties> = {
    primary: { background: '#2563eb', color: '#ffffff', borderColor: '#2563eb' },
    neutral: { background: '#ffffff', color: '#111827', borderColor: '#d1d5db' },
    danger: { background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' },
  };
  return (
    <button
      type="button"
      className={`dialog__button dialog__button--${variant}`}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 4,
        border: '1px solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: 'inherit',
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
        ...palette[variant],
      }}
    >
      {children}
    </button>
  );
}
