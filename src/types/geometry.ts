/**
 * Coordinate-system and geometry types shared across the application.
 *
 * Three coordinate spaces exist (design "Coordinate systems"):
 *  - Screen coordinates: CSS pixels relative to the viewport (Pointer_Event
 *    clientX/Y). Thresholds like the 8px minimum rectangle, 12px eraser radius,
 *    and 1-24px ink widths are defined here.
 *  - Canvas (world) coordinates: the infinite workspace. The Camera maps
 *    canvas -> screen via `screen = (canvas - pan) * zoom`. Ink strokes, item
 *    positions/sizes, and the initial Camera live here.
 *  - Page coordinates: relative to a single Page's top-left, independent of
 *    where the page sits on the canvas. Focus_Areas and Crop source rectangles
 *    are stored here so they survive re-layout.
 */

/** A 2D point. The coordinate space depends on the context it is used in. */
export interface Point {
  x: number;
  y: number;
}

/**
 * An axis-aligned rectangle in canvas/world coordinates. `(x, y)` is the
 * top-left corner; `width` and `height` extend right and down.
 */
export interface RectCanvas {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * An axis-aligned rectangle in Page coordinates (relative to a single Page's
 * top-left). Used for Focus_Areas and Crop source rectangles.
 */
export interface RectPage {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The Camera maps canvas (world) coordinates to screen coordinates. `panX`/
 * `panY` are in canvas units; `zoom` is clamped to [0.05, 8.0] by the camera
 * service.
 */
export interface Camera {
  panX: number;
  panY: number;
  zoom: number;
}

/** The visible viewport size in screen pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * A page's placement on the canvas: the canvas-space rectangle it occupies plus
 * its index and intrinsic (unscaled) page size in PDF points. The page size
 * gives the bijection between Page coordinates and canvas coordinates for the
 * current layout.
 */
export interface PagePlacement {
  /** Zero-based index of this page within the PDF. */
  pageIndex: number;
  /** The rectangle this page occupies in canvas/world coordinates. */
  rect: RectCanvas;
  /** Intrinsic page width in PDF points (before canvas scaling). */
  pageWidth: number;
  /** Intrinsic page height in PDF points (before canvas scaling). */
  pageHeight: number;
}
