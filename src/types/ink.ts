/**
 * Ink model types (design "Key interfaces" / ink service).
 *
 * Ink is stored in canvas (world) coordinates so strokes scale with the
 * content. Stroke width is also stored in canvas units (`screenWidth / zoom`).
 */

/**
 * A single sampled point of an ink stroke, in canvas coordinates. `pressure` is
 * normalized to the range 0..1 (1 when the pointer reports no varying pressure).
 */
export interface InkPoint {
  x: number;
  y: number;
  /** Normalized pen pressure in [0, 1]. */
  pressure: number;
}

/**
 * A handwritten ink stroke. `kept` distinguishes Kept_Ink (persisted to the
 * Presentation_File) from Discussion_Ink (transient, never persisted).
 */
export interface InkStroke {
  /** Sampled points in canvas coordinates, in draw order. */
  points: InkPoint[];
  /** CSS color string. */
  color: string;
  /** Base stroke width in canvas units. */
  width: number;
  /** True for Kept_Ink; false for transient Discussion_Ink. */
  kept: boolean;
}
