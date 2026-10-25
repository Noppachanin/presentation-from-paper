/**
 * Fullscreen control (task 14.2, Req 8.9).
 *
 * A minimal, feature-detected button that requests browser fullscreen for the
 * Application viewport. By default it calls {@link requestFullscreen} (standard
 * or WebKit-prefixed, see `fullscreen.ts`); callers may pass `onFullscreen` to
 * own the request and the Fullscreen_Fallback decision (Req 8.13, task 16).
 */

import { requestFullscreen } from './fullscreen';

export interface FullscreenButtonProps {
  /**
   * Called when the button is pressed. Defaults to requesting fullscreen on the
   * document element via the standard/WebKit API. Task 16 can pass a handler
   * that activates the Fullscreen_Fallback when the request is unavailable or
   * rejected.
   */
  readonly onFullscreen?: () => void;
  /** Optional style override merged onto the button. */
  readonly style?: React.CSSProperties;
}

const BUTTON_STYLE: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.1)',
  color: '#f9fafb',
  cursor: 'pointer',
  font: 'inherit',
  lineHeight: 1,
};

/** A button that puts the Application viewport into fullscreen (Req 8.9). */
export function FullscreenButton(props: FullscreenButtonProps) {
  const { onFullscreen, style } = props;
  const handleClick = () => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    // Fire-and-forget; the fallback (Req 8.13) is wired by task 16.
    void requestFullscreen();
  };
  return (
    <button
      type="button"
      className="fullscreen-button"
      title="Enter fullscreen"
      aria-label="Enter fullscreen"
      onClick={handleClick}
      style={{ ...BUTTON_STYLE, ...style }}
    >
      {'\u26F6'}
    </button>
  );
}
