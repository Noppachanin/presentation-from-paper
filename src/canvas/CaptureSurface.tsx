/**
 * Layer 5: the transparent input capture surface (task 13.2).
 *
 * A single transparent DOM element stacked above every visual layer. It has no
 * visuals; its only job is to be the one element the Input_Router listens on
 * for all Pointer_Events (design "Input_Router"). Putting every pointer on one
 * surface is what lets the router be the single owner of routing between pan/
 * zoom, the editing tools, Step navigation, and the Ink_Layer.
 *
 * ## Safari gesture suppression (Req 13.2, 13.3)
 * The surface sets `touch-action: none` so Safari does not consume touches for
 * scrolling, page zoom, or double-tap zoom — the app must receive every pen and
 * finger Pointer_Event (Req 13.2). It also sets `user-select: none` and
 * `-webkit-touch-callout: none` to suppress text selection and the touch
 * callout (Req 13.3). The remaining gesture suppression that needs JavaScript —
 * `preventDefault` on `gesturestart`/`gesturechange`/`gestureend`, `touchmove`,
 * and `contextmenu` — belongs to the Input_Router that attaches here (task
 * 15.1); those are non-trivial to get right (passive-listener rules) and are
 * out of scope for this rendering task.
 *
 * ## Handing the element to the Input_Router (task 15.1)
 * This component does **not** wire gestures. It exposes its DOM element two
 * ways so task 15.1 can attach the router:
 *  - a forwarded `ref` (so a parent can keep its own ref), and
 *  - an `onSurfaceReady(element)` callback fired once the element mounts (and
 *    `onSurfaceReady(null)`-free teardown is handled by the parent via the
 *    returned element's lifecycle; the callback fires again if the node
 *    changes).
 * Pick whichever the app shell prefers; both point at the same element.
 */

import { forwardRef, useCallback } from 'react';

export interface CaptureSurfaceProps {
  /**
   * Called with the surface element once it mounts, so the app shell (task
   * 15.1) can attach the Input_Router. Fired with `null` if the element
   * unmounts. Optional — a parent may use the forwarded `ref` instead.
   */
  readonly onSurfaceReady?: (element: HTMLDivElement | null) => void;
  /** Optional extra class name for the surface element. */
  readonly className?: string;
}

/**
 * The transparent capture surface. Renders a single full-bleed `<div>` that
 * suppresses Safari's default touch/selection behavior via CSS and forwards its
 * element to callers for pointer wiring. It intentionally registers no pointer
 * handlers itself.
 */
export const CaptureSurface = forwardRef<HTMLDivElement, CaptureSurfaceProps>(
  function CaptureSurface({ onSurfaceReady, className }, forwardedRef) {
    // Merge the forwarded ref with the onSurfaceReady callback: both receive the
    // same element (or null on unmount) via one callback ref.
    const setRef = useCallback(
      (element: HTMLDivElement | null) => {
        if (typeof forwardedRef === 'function') {
          forwardedRef(element);
        } else if (forwardedRef) {
          forwardedRef.current = element;
        }
        onSurfaceReady?.(element);
      },
      [forwardedRef, onSurfaceReady],
    );

    return (
      <div
        ref={setRef}
        className={className ? `capture-surface ${className}` : 'capture-surface'}
        style={{
          position: 'absolute',
          inset: 0,
          // Receive every pen/finger/mouse Pointer_Event (Req 13.2).
          pointerEvents: 'auto',
          // Suppress Safari scroll/zoom/double-tap-zoom touch handling (Req 13.2).
          touchAction: 'none',
          // Suppress text selection and the touch callout (Req 13.3).
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          // Transparent: no visuals, just capture.
          background: 'transparent',
        }}
      />
    );
  },
);
