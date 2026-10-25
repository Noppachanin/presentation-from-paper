/**
 * Fullscreen_Fallback hint (task 16.1, Req 8.13).
 *
 * When the Fullscreen API is unavailable or the request is rejected (the usual
 * case on iPhone/iPad Safari), the app keeps its viewport-filling layout and
 * shows this dismissible hint telling the user they can add the app to the
 * Home Screen for a full-screen presentation. The hint is suppressed while the
 * app already runs in Home_Screen_Mode (see {@link isStandalone}).
 */

import { isStandalone } from './standalone';

export interface HomeScreenHintProps {
  /**
   * Whether the hint is requested (fullscreen was unavailable or rejected).
   * The hint still suppresses itself when already running standalone.
   */
  readonly open: boolean;
  /** Dismiss callback (the hint is dismissible, Req 8.13). */
  readonly onDismiss: () => void;
}

const CONTAINER_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  maxWidth: 'min(90vw, 420px)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.92)',
  color: '#f9fafb',
  font: '14px/1.4 system-ui, sans-serif',
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  zIndex: 60,
};

/**
 * The Home Screen hint shown as the Fullscreen_Fallback (Req 8.13). Renders
 * nothing when not requested or when already in Home_Screen_Mode.
 */
export function HomeScreenHint(props: HomeScreenHintProps) {
  const { open, onDismiss } = props;
  // Suppress when not requested or already installed/standalone.
  if (!open || isStandalone()) {
    return null;
  }
  return (
    <div role="status" aria-live="polite" style={CONTAINER_STYLE}>
      <span>
        Fullscreen isn&apos;t available here. Add this app to your Home Screen for
        a full-screen presentation.
      </span>
      <button
        type="button"
        aria-label="Dismiss hint"
        onClick={onDismiss}
        style={{
          flex: '0 0 auto',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.1)',
          color: '#f9fafb',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        Got it
      </button>
    </div>
  );
}
