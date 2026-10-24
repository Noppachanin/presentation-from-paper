/**
 * Pressure-to-width mapping for Ink_Strokes.
 *
 * Maps a normalized pen pressure in [0, 1] to a stroke width between 25% and
 * 100% of the selected base width (design: Req 14.7, 14.8):
 *
 *     width = base * (0.25 + 0.75 * clampedPressure)
 *
 * so pressure 0 -> 25% of base, pressure 1 -> 100% of base, and the mapping is
 * monotonic non-decreasing in pressure.
 *
 * Convention for "no varying pressure" (Req 14.8): when the device reports no
 * usable pressure the pointer convention in this app is `pressure = 1`, which
 * already yields 100% width. For robustness this function also treats a
 * non-finite pressure (NaN) or a pressure at/below 0 as "no pressure signal"
 * and returns the full base width, so a flat/absent pressure stream always
 * draws at 100%. Pressures above 1 are clamped to 1 (also 100%).
 *
 * Pure: no DOM, no mutation.
 */

/**
 * Compute the stroke width for a given base width and pen pressure.
 *
 * @param base     The selected base stroke width (canvas units). Non-positive
 *                 or non-finite base widths return 0.
 * @param pressure Normalized pen pressure. Values are clamped into [0, 1];
 *                 NaN or values <= 0 are treated as "no pressure" -> full width.
 * @returns The width between 25% and 100% of `base`.
 */
export function widthForPressure(base: number, pressure: number): number {
  if (!Number.isFinite(base) || base <= 0) {
    return 0;
  }

  // No usable pressure signal (NaN, or no/zero pressure): draw at full width.
  if (!Number.isFinite(pressure) || pressure <= 0) {
    return base;
  }

  const clamped = pressure >= 1 ? 1 : pressure;
  return base * (0.25 + 0.75 * clamped);
}
