/**
 * Ink service barrel.
 *
 * Pure ink model helpers: the Stroke_Smoother and the pressure-to-width
 * mapping. Import from `../ink` (or `@/ink`) rather than the individual files
 * so the module layout can change without touching call sites.
 */

export { smooth } from './smoother';
export { widthForPressure } from './pressure';
