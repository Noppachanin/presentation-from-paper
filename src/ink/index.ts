/**
 * Ink service barrel.
 *
 * Pure ink model helpers: the Stroke_Smoother, the pressure-to-width mapping,
 * the Eraser_Tool hit test, and the Ink_Clear_Policy engine. Import from
 * `../ink` (or `@/ink`) rather than the individual files so the module layout
 * can change without touching call sites.
 */

export { smooth } from './smoother';
export { widthForPressure } from './pressure';
export { eraseAt, ERASER_SCREEN_RADIUS_PX } from './eraser';
export type { EraseResult } from './eraser';
export {
  FADE_DURATION_SECONDS,
  fadeOpacity,
  shouldRemoveFaded,
  applyFadeOut,
  clearOnStepChange,
  policyClearsOnStepChange,
  strokesAfterStepChange,
} from './clearPolicy';
export type { TimedStroke } from './clearPolicy';
