/**
 * Layer 1: the windowed PageLayer (task 13.1).
 *
 * Renders the PDF pages laid out in their canvas-space {@link PagePlacement}
 * rectangles, under the single shared Camera transform (see transform.ts). Only
 * pages intersecting the viewport (plus a screen-pixel margin) keep a rendered
 * PDF.js bitmap; off-screen pages release theirs (Req 1.7). While a visible
 * page's bitmap is being rendered, a placeholder box sized to the page's
 * dimensions is shown in its place (Req 1.3). When the Camera zoom changes the
 * layer asks the renderer to re-render the visible pages to the new zoom; the
 * 500 ms settle debounce lives inside the renderer's `scheduleRerender`
 * (Req 1.6 — wired here, debounced there).
 *
 * ## Shared transform (Req 1.2)
 * Pages are positioned in **canvas coordinates** inside a single container that
 * carries the Camera as one CSS transform (`cameraTransform`), so the PageLayer
 * stays pixel-registered with the Item/Overlay/Ink layers that use the same
 * transform. Each page's `<canvas>`/placeholder is absolutely positioned at its
 * placement rect's canvas coordinates; the container transform maps it to
 * screen.
 *
 * ## Renderer ownership
 * The {@link PdfPageRenderer} is created when a PDF is opened (task 15.1 wires
 * that into the app shell). For testability and self-containment the PageLayer
 * takes the renderer (or `null` when no PDF is open) as a prop, along with the
 * placements. It never creates or destroys the renderer.
 */

import { useEffect, useRef, useState } from 'react';
import type { Camera, PagePlacement, Viewport } from '../types';
import type { PdfPageRenderer, RenderedPage } from '../pdf';
import { cameraTransform, visiblePageIndices } from './transform';

/** Extra margin around the viewport, in screen pixels, kept rendered (Req 1.7). */
export const PAGE_WINDOW_MARGIN_PX = 400;

export interface PageLayerProps {
  /** Page placements in canvas coordinates (from `LoadedPdf.placements`). */
  readonly placements: readonly PagePlacement[];
  /** The live Camera, shared by every layer. */
  readonly camera: Camera;
  /** The viewport size in screen pixels. */
  readonly viewport: Viewport;
  /**
   * The per-document page renderer, or `null` when no PDF is open. Supplied by
   * the app shell (task 15.1); taken as a prop so the layer is self-contained
   * and testable.
   */
  readonly renderer: PdfPageRenderer | null;
  /** Window margin in screen pixels (defaults to {@link PAGE_WINDOW_MARGIN_PX}). */
  readonly windowMarginPx?: number;
}

/** A single page's render state used to choose bitmap vs placeholder. */
interface PageRenderState {
  readonly bitmap: RenderedPage | null;
  readonly rendering: boolean;
}

/**
 * The windowed page layer. Pure presentational component driven entirely by its
 * props and the injected renderer.
 */
export function PageLayer({
  placements,
  camera,
  viewport,
  renderer,
  windowMarginPx = PAGE_WINDOW_MARGIN_PX,
}: PageLayerProps) {
  // Per-page render state, keyed by page index. A map in React state so a
  // completed/failed render re-renders only the affected page row.
  const [renderStates, setRenderStates] = useState<Map<number, PageRenderState>>(
    () => new Map(),
  );

  // The set of pages currently visible (plus margin). Recomputed from the
  // Camera/viewport/placements on every change.
  const visible = visiblePageIndices(placements, camera, viewport, windowMarginPx);
  const visibleKey = visible.join(',');

  // Track the last zoom we rendered at so a zoom change triggers a re-render.
  const lastZoomRef = useRef<number | null>(null);
  // Guard against setting state after unmount from an in-flight render.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Render visible pages (and release the rest) whenever the visible set, the
  // zoom, or the renderer changes.
  useEffect(() => {
    if (!renderer) {
      return;
    }

    const zoom = camera.zoom;

    // Release every page that is no longer visible (Req 1.7).
    renderer.releaseAllExcept(visible);

    // Drop render state for released pages so their placeholders don't linger.
    setRenderStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const index of prev.keys()) {
        if (!visible.includes(index)) {
          next.delete(index);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const zoomChanged = lastZoomRef.current !== null && lastZoomRef.current !== zoom;

    // Kick off a render for each visible page that lacks a current bitmap.
    for (const pageIndex of visible) {
      const existing = renderer.getBitmap(pageIndex);
      if (existing && !zoomChanged) {
        // Already have a bitmap at a usable scale; keep it (re-render on zoom
        // settle is handled below via scheduleRerender).
        setRenderStates((prev) => {
          if (prev.get(pageIndex)?.bitmap === existing) return prev;
          const next = new Map(prev);
          next.set(pageIndex, { bitmap: existing, rendering: false });
          return next;
        });
        continue;
      }

      // Mark the page as rendering so a placeholder shows (Req 1.3), unless we
      // already have a bitmap to keep visible while the new one renders.
      setRenderStates((prev) => {
        const current = prev.get(pageIndex);
        const next = new Map(prev);
        next.set(pageIndex, {
          bitmap: current?.bitmap ?? null,
          rendering: true,
        });
        return next;
      });

      renderer
        .renderPage(pageIndex, zoom)
        .then((rendered) => {
          if (!mountedRef.current) return;
          setRenderStates((prev) => {
            const next = new Map(prev);
            next.set(pageIndex, { bitmap: rendered, rendering: false });
            return next;
          });
        })
        .catch((error: unknown) => {
          // A superseded render cancels cleanly; ignore that, surface the rest.
          if ((error as { name?: string } | null)?.name !== 'RenderingCancelledException') {
            // eslint-disable-next-line no-console
            console.error(error);
          }
          if (!mountedRef.current) return;
          setRenderStates((prev) => {
            const current = prev.get(pageIndex);
            if (!current?.rendering) return prev;
            const next = new Map(prev);
            next.set(pageIndex, { bitmap: current.bitmap, rendering: false });
            return next;
          });
        });
    }

    // On zoom change, schedule a debounced re-render of the visible pages to the
    // settled zoom (Req 1.6). The 500 ms debounce lives in the renderer.
    if (zoomChanged) {
      renderer.scheduleRerender(visible, zoom);
    }
    lastZoomRef.current = zoom;
    // visibleKey captures the visible-set change; camera.zoom captures zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, visibleKey, camera.zoom]);

  return (
    <div
      className="page-layer"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        className="page-layer__scene"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cameraTransform(camera),
          willChange: 'transform',
        }}
      >
        {placements.map((placement) => {
          const state = renderStates.get(placement.pageIndex);
          const isVisible = visible.includes(placement.pageIndex);
          return (
            <PageView
              key={placement.pageIndex}
              placement={placement}
              bitmap={isVisible ? state?.bitmap ?? null : null}
            />
          );
        })}
      </div>
    </div>
  );
}

/** One page: its rendered bitmap when available, otherwise a sized placeholder. */
function PageView({
  placement,
  bitmap,
}: {
  placement: PagePlacement;
  bitmap: RenderedPage | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Blit the rendered bitmap into the page's own display canvas. The display
  // canvas is sized in canvas-coordinate units (the placement rect) and the
  // shared Camera transform scales it to screen, so a single bitmap stays crisp
  // as long as it was rendered near the current zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // `drawImage` accepts an HTMLCanvasElement or OffscreenCanvas source.
    ctx.drawImage(bitmap.canvas as CanvasImageSource, 0, 0);
  }, [bitmap]);

  const { rect } = placement;
  const common = {
    position: 'absolute' as const,
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };

  if (bitmap) {
    return (
      <canvas
        ref={canvasRef}
        className="page-layer__page"
        style={{ ...common, display: 'block' }}
      />
    );
  }

  // Placeholder sized to the page's dimensions while the bitmap renders (Req 1.3).
  return (
    <div
      className="page-layer__placeholder"
      data-page-index={placement.pageIndex}
      style={{
        ...common,
        background: '#ffffff',
        border: '1px solid #d0d0d0',
        boxSizing: 'border-box',
      }}
    />
  );
}
