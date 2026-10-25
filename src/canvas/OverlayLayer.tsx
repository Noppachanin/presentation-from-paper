/**
 * Layer 3: the OverlayLayer canvas (task 13.2).
 *
 * A single `<canvas>` drawn above the Pages (Layer 1) and Items (Layer 2) that
 * renders the vector chrome of the scene — Focus_Area outlines and their
 * Sequence-position labels (Req 3.7), Connector lines between their live
 * nearest-edge endpoints (Req 5.6/5.5), and the selection/resize handles for a
 * selected item. These are cheap vector shapes that redraw every frame, so they
 * live on their own canvas and never touch the (expensive) page bitmaps
 * (design "Rendering architecture", Layer 3).
 *
 * ## Why a `<canvas>` with a transformed 2D context (not a CSS transform)
 * The Page/Item/Ink layers position DOM/canvas elements in **canvas
 * coordinates** inside a container that carries the shared Camera as one CSS
 * transform ({@link cameraTransform}). The overlay instead uses a full-viewport
 * `<canvas>` and applies the Camera to the **2D drawing context** before
 * drawing shapes in canvas coordinates:
 *
 *   ctx.setTransform(dpr,0,0,dpr,0,0)                  // device-pixel backing
 *   ctx.translate(-panX*zoom, -panY*zoom); ctx.scale(zoom, zoom)
 *
 * The second step is exactly {@link cameraTransform} expressed on the context,
 * so the overlay stays pixel-registered with the CSS-transformed layers. A
 * transformed context is chosen (over a CSS-transformed canvas) because stroke
 * widths, label text, and handle sizes must stay a constant *screen* size
 * regardless of zoom; with a transformed context we simply divide the desired
 * screen size by `zoom` when drawing, instead of fighting a scaled bitmap.
 *
 * ## Present_Mode visibility (Req 3.8, 5.6)
 * In Edit_Mode every Focus_Area outline + label and every Connector is drawn,
 * plus the selection handles. In Present_Mode the overlay shows **only** the
 * current Step's target Focus_Area (its outline/label) and **only** the
 * Connectors attached to that target, and never draws edit handles (Req 8.1).
 * The current target is `sequence[currentStepIndex].itemId`.
 *
 * ## Props, not stores (testability)
 * Everything the layer needs — the document slices it reads, the Camera, the
 * viewport, the mode, the current Step index, and the optional `selectedId` —
 * is passed as props so the component renders deterministically and is testable
 * without mounting the app or wiring the stores. Selection *input* wiring
 * (setting `selectedId` from pointer hits) is task 15.1; this layer only draws
 * the handles for whatever `selectedId` it is given.
 */

import { useEffect, useRef } from 'react';
import type {
  Camera,
  Connector,
  DocumentState,
  FocusArea,
  PagePlacement,
  Viewport,
} from '../types';
import { pageToCanvas } from '../geometry';
import { computeConnectorEndpoints, resolveTargetRect } from '../items';
import { focusAreaLabel } from '../sequence';

/** Side length, in screen pixels, of each square selection/resize handle. */
export const HANDLE_SCREEN_PX = 8;
/** Focus_Area / connector line thickness in screen pixels. */
const LINE_SCREEN_PX = 2;
/** Selection outline thickness in screen pixels. */
const SELECTION_SCREEN_PX = 1.5;
/** Focus_Area label font size in screen pixels. */
const LABEL_FONT_SCREEN_PX = 14;

const FOCUS_STROKE = '#2563eb';
const FOCUS_LABEL_BG = '#2563eb';
const FOCUS_LABEL_FG = '#ffffff';
const CONNECTOR_STROKE = '#475569';
const SELECTION_STROKE = '#2563eb';
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#2563eb';

/**
 * The subset of {@link DocumentState} the OverlayLayer reads. Accepting the
 * whole document keeps the reused selectors ({@link computeConnectorEndpoints},
 * {@link focusAreaLabel}, {@link resolveTargetRect}) usable unchanged, since
 * they take a `DocumentState`.
 */
export type OverlayDocument = Pick<
  DocumentState,
  'pages' | 'focusAreas' | 'notes' | 'images' | 'crops' | 'connectors' | 'sequence'
>;

export interface OverlayLayerProps {
  /** The document slices the overlay reads (focus areas, connectors, …). */
  readonly doc: OverlayDocument;
  /** The live Camera, shared by every layer. */
  readonly camera: Camera;
  /** The viewport size in screen pixels (sets the canvas backing store). */
  readonly viewport: Viewport;
  /** Application mode; drives Present_Mode visibility rules (Req 3.8, 5.6). */
  readonly mode: 'edit' | 'present';
  /** Index of the current Step; selects the Present_Mode target. */
  readonly currentStepIndex: number;
  /**
   * The currently selected item id (Focus_Area or white-space item), or `null`.
   * Selection/resize handles are drawn around it in Edit_Mode. Selection input
   * wiring is task 15.1; this layer only renders the handles.
   */
  readonly selectedId?: string | null;
  /** Device pixel ratio override (defaults to `devicePixelRatio`, for tests). */
  readonly pixelRatio?: number;
}

/**
 * The overlay canvas. Repaints whenever any input that affects the drawing
 * changes. The component itself renders a single `<canvas>`; all drawing is in
 * the effect below.
 */
export function OverlayLayer({
  doc,
  camera,
  viewport,
  mode,
  currentStepIndex,
  selectedId = null,
  pixelRatio,
}: OverlayLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr =
      pixelRatio ??
      (typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1);

    // Size the backing store to device pixels so vector chrome is crisp; the
    // CSS size stays the viewport's logical size (set via style below).
    const backingWidth = Math.max(1, Math.round(viewport.width * dpr));
    const backingHeight = Math.max(1, Math.round(viewport.height * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawOverlay(ctx, {
      doc,
      camera,
      dpr,
      mode,
      currentStepIndex,
      selectedId,
    });
  }, [doc, camera, viewport.width, viewport.height, mode, currentStepIndex, selectedId, pixelRatio]);

  return (
    <canvas
      ref={canvasRef}
      className="overlay-layer"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // The overlay is painted chrome; gestures are owned by the capture
        // surface (Layer 5) / app shell.
        pointerEvents: 'none',
      }}
    />
  );
}

/** Immutable draw inputs resolved once per repaint. */
interface OverlayDrawContext {
  readonly doc: OverlayDocument;
  readonly camera: Camera;
  readonly dpr: number;
  readonly mode: 'edit' | 'present';
  readonly currentStepIndex: number;
  readonly selectedId: string | null;
}

/**
 * Paint one overlay frame. Pure w.r.t. its inputs (reads only `ctx` state it
 * sets itself), exported for unit tests that drive a 2D context (real or
 * stubbed) directly without mounting the component.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  { doc, camera, dpr, mode, currentStepIndex, selectedId }: OverlayDrawContext,
): void {
  // Reset to device pixels and clear the whole backing store.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Apply the shared Camera to the context so we can draw in canvas coords. The
  // net transform (device px) is dpr · (translate(-pan·zoom) · scale(zoom)).
  ctx.translate(-camera.panX * camera.zoom, -camera.panY * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  // A screen pixel is `1 / zoom` canvas units; convert constant screen sizes.
  const sp = (screenPx: number) => screenPx / camera.zoom;

  const presenting = mode === 'present';
  const currentTargetId = presenting
    ? doc.sequence[currentStepIndex]?.itemId ?? null
    : null;

  // --- Focus_Area outlines + Sequence labels (Req 3.7, 3.8) ---
  for (const focus of doc.focusAreas) {
    // Present_Mode: only the current Step's target Focus_Area is shown.
    if (presenting && focus.id !== currentTargetId) {
      continue;
    }
    drawFocusArea(ctx, doc, focus, sp);
  }

  // --- Connectors (Req 5.6) ---
  for (const connector of doc.connectors) {
    // Present_Mode: only Connectors attached to the current target (Req 5.6).
    if (presenting && !connectorTouchesTarget(connector, currentTargetId)) {
      continue;
    }
    drawConnector(ctx, doc, connector, sp);
  }

  // --- Selection / resize handles (Edit_Mode only; Req 8.1 hides them in present) ---
  if (!presenting && selectedId) {
    drawSelectionHandles(ctx, doc, selectedId, sp);
  }
}

/** Whether a Connector attaches to `targetId` on either end. */
function connectorTouchesTarget(connector: Connector, targetId: string | null): boolean {
  if (targetId === null) return false;
  return connector.fromItemId === targetId || connector.toTargetId === targetId;
}

/** Find a Focus_Area's page placement, or `undefined` if the page is missing. */
function pageFor(pages: readonly PagePlacement[], pageIndex: number): PagePlacement | undefined {
  return pages.find((p) => p.pageIndex === pageIndex);
}

/**
 * Draw one Focus_Area: its outlined rectangle (Page coords → canvas via the
 * matching page placement) and its 1-based Sequence position label (Req 3.7).
 */
function drawFocusArea(
  ctx: CanvasRenderingContext2D,
  doc: OverlayDocument,
  focus: FocusArea,
  sp: (screenPx: number) => number,
): void {
  const page = pageFor(doc.pages, focus.pageIndex);
  if (!page) return; // no placement yet → skip (Req 3.7 needs the page)

  const topLeft = pageToCanvas({ x: focus.rect.x, y: focus.rect.y }, page);
  const bottomRight = pageToCanvas(
    { x: focus.rect.x + focus.rect.width, y: focus.rect.y + focus.rect.height },
    page,
  );
  const x = topLeft.x;
  const y = topLeft.y;
  const w = bottomRight.x - topLeft.x;
  const h = bottomRight.y - topLeft.y;

  ctx.save();
  ctx.strokeStyle = FOCUS_STROKE;
  ctx.lineWidth = sp(LINE_SCREEN_PX);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  // Label = 1-based position in the Sequence (derived, never stored).
  const position = focusAreaLabel(doc as DocumentState, focus.id);
  if (position !== undefined) {
    drawLabel(ctx, String(position), x, y, sp);
  }
}

/**
 * Draw a Focus_Area's position label as white text on a filled pill anchored at
 * the rectangle's top-left corner. Font/padding are constant screen sizes
 * (scaled to canvas units via `sp`).
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  rectX: number,
  rectY: number,
  sp: (screenPx: number) => number,
): void {
  const fontPx = sp(LABEL_FONT_SCREEN_PX);
  const padX = sp(5);
  const padY = sp(3);

  ctx.save();
  ctx.font = `${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const boxW = textW + padX * 2;
  const boxH = fontPx + padY * 2;

  // Anchor the label just above the rectangle's top-left so it does not cover
  // the focused content; it sits on the corner when there is room.
  const boxX = rectX;
  const boxY = rectY - boxH;

  ctx.fillStyle = FOCUS_LABEL_BG;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = FOCUS_LABEL_FG;
  ctx.fillText(text, boxX + padX, boxY + padY);
  ctx.restore();
}

/**
 * Draw one Connector as a line between its live nearest-edge endpoints,
 * recomputed from the two targets' current rectangles every frame (Req 5.5,
 * 5.6). Skipped when either end cannot be resolved.
 */
function drawConnector(
  ctx: CanvasRenderingContext2D,
  doc: OverlayDocument,
  connector: Connector,
  sp: (screenPx: number) => number,
): void {
  const endpoints = computeConnectorEndpoints(doc as DocumentState, connector);
  if (!endpoints) return;

  ctx.save();
  ctx.strokeStyle = CONNECTOR_STROKE;
  ctx.lineWidth = sp(LINE_SCREEN_PX);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(endpoints.from.x, endpoints.from.y);
  ctx.lineTo(endpoints.to.x, endpoints.to.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the selection outline and the eight resize handles (corners + edge
 * midpoints) around the selected item's canvas-space rectangle. The item may be
 * a Focus_Area (Page coords, converted) or a white-space item (already canvas
 * coords); {@link resolveTargetRect} handles both. No-op when the id resolves
 * to nothing.
 */
function drawSelectionHandles(
  ctx: CanvasRenderingContext2D,
  doc: OverlayDocument,
  selectedId: string,
  sp: (screenPx: number) => number,
): void {
  const rect = resolveTargetRect(doc as DocumentState, selectedId);
  if (!rect) return;

  const { x, y, width: w, height: h } = rect;

  ctx.save();
  // Selection outline.
  ctx.strokeStyle = SELECTION_STROKE;
  ctx.lineWidth = sp(SELECTION_SCREEN_PX);
  ctx.strokeRect(x, y, w, h);

  // Eight handles: four corners + four edge midpoints.
  const handle = sp(HANDLE_SCREEN_PX);
  const half = handle / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points: Array<[number, number]> = [
    [x, y],
    [cx, y],
    [x + w, y],
    [x + w, cy],
    [x + w, y + h],
    [cx, y + h],
    [x, y + h],
    [x, cy],
  ];

  ctx.fillStyle = HANDLE_FILL;
  ctx.strokeStyle = HANDLE_STROKE;
  ctx.lineWidth = sp(1);
  for (const [hx, hy] of points) {
    ctx.fillRect(hx - half, hy - half, handle, handle);
    ctx.strokeRect(hx - half, hy - half, handle, handle);
  }
  ctx.restore();
}
