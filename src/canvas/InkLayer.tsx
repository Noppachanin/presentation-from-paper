/**
 * Layer 4: the InkLayer canvas (task 13.2).
 *
 * An **independent** `<canvas>` above the Pages that renders every Ink_Stroke —
 * Kept_Ink plus Discussion_Ink plus the optional in-progress stroke — and the
 * pen hover cursor. It is deliberately its own canvas so that drawing ink never
 * triggers a Page re-render (Req 14.1): the app shell repaints only this layer
 * while a stroke is live, leaving Layers 1–3 untouched.
 *
 * ## Shared Camera on the 2D context (same choice as OverlayLayer)
 * Ink points are stored in **canvas coordinates** with a width in canvas units
 * (Req 14.4, 14.5, 14.6). Like the OverlayLayer, this layer is a full-viewport
 * canvas whose 2D context carries the Camera, so strokes stay attached to the
 * underlying content as the Camera pans/zooms (Req 14.5):
 *
 *   ctx.setTransform(dpr,0,0,dpr,0,0)
 *   ctx.translate(-panX*zoom, -panY*zoom); ctx.scale(zoom, zoom)
 *
 * A stroke's stored width is already in canvas units, so it is used directly as
 * the context `lineWidth` under this transform and scales with zoom (Req 14.5).
 * The hover cursor, by contrast, shows the selected *screen* width, so its
 * radius is converted to canvas units by dividing by `zoom`.
 *
 * ## Rendering a stroke (Req 14.4, 14.7, 14.8, 14.10, 14.11)
 * Each stroke is first thinned by the Stroke_Smoother ({@link smooth}) in screen
 * space, then drawn. Per-point width comes from {@link widthForPressure} applied
 * to the stroke's base width and that point's pressure: because width can vary
 * along the stroke, consecutive segments are stroked individually with the
 * width of their endpoint, which both honors pressure (Req 14.7) and renders a
 * flat/absent pressure stream at full width (Req 14.8). A stroke that reduces to
 * a single point is drawn as a filled dot of the base width (Req 14.11).
 *
 * ## In-progress stroke + hover cursor (Req 14.12, 14.13, 13.14, 14.9)
 * An optional `inProgressStroke` prop lets the app shell repaint only this layer
 * as a live stroke grows, so new segments appear within the latency budget
 * (Req 14.12) without disturbing other layers (Req 14.13). An optional
 * `hoverCursor` prop (point + screen width) draws a width-sized ring at the pen
 * hover position; the app shell passes it only where hover is reported and ink/
 * eraser is active or the app is in Present_Mode (Req 13.14, 14.9), and omits it
 * to hide the cursor when hover ends.
 *
 * ## Props, not stores (testability)
 * Strokes, Camera, viewport, the in-progress stroke, and the hover cursor are
 * all props, so the layer repaints deterministically and the {@link drawInk}
 * helper can be unit-tested against a 2D context without mounting the app.
 */

import { useEffect, useRef } from 'react';
import type { Camera, InkStroke, Point, Viewport } from '../types';
import { smooth, widthForPressure } from '../ink';

/** Minimum spacing between kept points, in screen pixels (design default). */
const SMOOTH_MIN_SCREEN_PX = 1;

/** A pen hover cursor: where to draw it and the selected width it should show. */
export interface HoverCursor {
  /** Hover position in canvas coordinates. */
  readonly point: Point;
  /** The selected ink/eraser width in screen pixels (ring diameter). */
  readonly widthScreenPx: number;
}

export interface InkLayerProps {
  /** Kept_Ink strokes (persisted). Rendered first (under Discussion_Ink). */
  readonly keptInk: readonly InkStroke[];
  /** Discussion_Ink strokes (transient). Rendered above Kept_Ink. */
  readonly discussionInk: readonly InkStroke[];
  /** The live Camera, shared by every layer. */
  readonly camera: Camera;
  /** The viewport size in screen pixels (sets the canvas backing store). */
  readonly viewport: Viewport;
  /**
   * The stroke currently being drawn, if any. Passing it lets the app shell
   * repaint only this layer during a live stroke (Req 14.12, 14.13). It is
   * drawn last, above all committed strokes.
   */
  readonly inProgressStroke?: InkStroke | null;
  /**
   * The pen hover cursor to draw, or `null`/omitted to hide it (Req 13.14,
   * 14.9). The app shell supplies it only where hover is reported and the
   * Ink/Eraser tool is active or the app is in Present_Mode.
   */
  readonly hoverCursor?: HoverCursor | null;
  /** Device pixel ratio override (defaults to `devicePixelRatio`, for tests). */
  readonly pixelRatio?: number;
}

/**
 * The ink canvas. Repaints whenever its strokes, the Camera/viewport, the
 * in-progress stroke, or the hover cursor change — and nothing else, so page
 * layers never re-render because of ink (Req 14.1).
 */
export function InkLayer({
  keptInk,
  discussionInk,
  camera,
  viewport,
  inProgressStroke = null,
  hoverCursor = null,
  pixelRatio,
}: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr =
      pixelRatio ??
      (typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1);

    const backingWidth = Math.max(1, Math.round(viewport.width * dpr));
    const backingHeight = Math.max(1, Math.round(viewport.height * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawInk(ctx, {
      keptInk,
      discussionInk,
      camera,
      dpr,
      inProgressStroke,
      hoverCursor,
    });
  }, [
    keptInk,
    discussionInk,
    camera,
    viewport.width,
    viewport.height,
    inProgressStroke,
    hoverCursor,
    pixelRatio,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="ink-layer"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // Ink is painted output; the capture surface (Layer 5) owns pointers.
        pointerEvents: 'none',
      }}
    />
  );
}

/** Immutable draw inputs resolved once per repaint. */
interface InkDrawContext {
  readonly keptInk: readonly InkStroke[];
  readonly discussionInk: readonly InkStroke[];
  readonly camera: Camera;
  readonly dpr: number;
  readonly inProgressStroke: InkStroke | null;
  readonly hoverCursor: HoverCursor | null;
}

/**
 * Paint one ink frame: Kept_Ink, then Discussion_Ink, then the in-progress
 * stroke, then the hover cursor. Exported for unit tests that drive a 2D
 * context directly without mounting the component.
 */
export function drawInk(
  ctx: CanvasRenderingContext2D,
  { keptInk, discussionInk, camera, dpr, inProgressStroke, hoverCursor }: InkDrawContext,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Apply the shared Camera so ink draws in canvas coordinates (Req 14.5).
  ctx.translate(-camera.panX * camera.zoom, -camera.panY * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  for (const stroke of keptInk) {
    drawStroke(ctx, stroke, camera.zoom);
  }
  for (const stroke of discussionInk) {
    drawStroke(ctx, stroke, camera.zoom);
  }
  if (inProgressStroke) {
    drawStroke(ctx, inProgressStroke, camera.zoom);
  }

  if (hoverCursor) {
    drawHoverCursor(ctx, hoverCursor, camera.zoom);
  }
}

/**
 * Draw a single Ink_Stroke under the already-applied Camera transform.
 *
 * The stroke is thinned by {@link smooth} (screen-space test; Req 14.10) and
 * then rendered. A single remaining point is a dot of the base width
 * (Req 14.11). For multi-point strokes each segment is stroked with the
 * pressure-scaled width of its endpoint ({@link widthForPressure}; Req 14.7,
 * 14.8), giving a pressure-varying line without a separate variable-width path.
 */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, zoom: number): void {
  const points = smooth(stroke.points, SMOOTH_MIN_SCREEN_PX, zoom);
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Single-point stroke → filled dot of the base width (Req 14.11).
  if (points.length === 1) {
    const only = points[0];
    const width = widthForPressure(stroke.width, only.pressure);
    if (width > 0) {
      ctx.beginPath();
      ctx.arc(only.x, only.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Multi-point: stroke each segment with its endpoint's pressure width so the
  // line thickness follows pressure along the stroke (Req 14.7, 14.8).
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const width = widthForPressure(stroke.width, b.pressure);
    if (width <= 0) continue;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the pen hover cursor: an outlined ring whose diameter equals the
 * selected *screen* width at the hover point (Req 13.14, 14.9). The screen
 * width is converted to canvas units (÷ zoom) because the context is scaled by
 * the Camera; the outline thickness is likewise kept a constant screen size.
 */
function drawHoverCursor(
  ctx: CanvasRenderingContext2D,
  cursor: HoverCursor,
  zoom: number,
): void {
  const radiusCanvas = Math.max(cursor.widthScreenPx, 1) / 2 / zoom;

  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.arc(cursor.point.x, cursor.point.y, radiusCanvas, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
