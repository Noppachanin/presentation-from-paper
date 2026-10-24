/**
 * Ink_Clear_Policy engine (design: Req 14.18-14.25).
 *
 * The engine decides when Discussion_Ink is automatically removed and, for the
 * "fade out" policy, how opaque each fading stroke is right now. It is pure and
 * deterministic: all timing is driven by an INJECTED clock. Every helper that
 * depends on the current time takes a `now` argument (epoch milliseconds); none
 * of them read `Date.now()` internally, so tests can drive time precisely.
 *
 * Policies (Req 14.19):
 *  - "keep-until-cleared" (default): Discussion_Ink is never auto-removed; it
 *    only disappears when the user clears ink explicitly (Req 14.19).
 *  - "clear-on-step-change": a step-change event removes all Discussion_Ink
 *    (Req 14.21, 14.22).
 *  - "fade-out": a Discussion_Ink stroke stays fully opaque for
 *    `fadeDelaySeconds` after the contact that drew it ends, then fades to
 *    transparent over FADE_DURATION_SECONDS, and is removed once the fade
 *    completes (Req 14.20).
 *
 * Kept_Ink exemption: a stroke with `kept === true` is ALWAYS exempt from both
 * fading and clear-on-step-change (Req 14.23, 14.25). The keep-ink toggle
 * (Req 14.24) governs how NEW strokes acquire `kept: true` elsewhere; this
 * engine only honors the flag that is already on each stroke.
 *
 * Per-stroke timing: InkStroke has no timestamp field, and this engine does NOT
 * modify the shared type. Instead, fade timing is modeled over a small wrapper,
 * {@link TimedStroke}, that carries the stroke plus the `createdAt` time (epoch
 * ms) of the end of the drawing contact. Call sites outside the ink module own
 * the creation of these wrappers.
 *
 * Pure: no DOM, no mutation, no ambient clock.
 */

import type { InkClearPolicy, InkStroke } from '../types';

/**
 * Fade duration in seconds: a fading stroke ramps from fully opaque to fully
 * transparent over this span, starting after the user-selected delay
 * (Req 14.20 specifies a 1-second fade).
 */
export const FADE_DURATION_SECONDS = 1;

/**
 * A Discussion_Ink stroke paired with the time its drawing contact ended.
 *
 * `createdAt` is epoch milliseconds (same clock as the `now` passed to the fade
 * helpers) and marks the start of the fade delay for the "fade out" policy.
 */
export interface TimedStroke {
  stroke: InkStroke;
  /** Epoch ms when the contact that drew the stroke ended (fade-delay anchor). */
  createdAt: number;
}

/** Clamp a value into the inclusive range [min, max]. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * The current opacity (0..1) of a fading Discussion_Ink stroke under the
 * "fade out" policy.
 *
 * The stroke is fully opaque (1) until `fadeDelaySeconds` have elapsed since
 * `createdAt`, then ramps linearly down to 0 across FADE_DURATION_SECONDS, and
 * stays at 0 afterwards. Kept_Ink is exempt and always returns 1.
 *
 * This helper is independent of which policy is active; callers apply it only
 * while the policy is "fade-out". A non-finite or negative `fadeDelaySeconds`
 * is treated as 0 (fade starts immediately) for robustness.
 *
 * @param timed            The stroke and the time its contact ended.
 * @param fadeDelaySeconds The user-selected delay before fading begins (1..30,
 *                         default 5 per Req 14.20).
 * @param now              The current time in epoch ms (injected clock).
 * @returns The stroke opacity in the range [0, 1].
 */
export function fadeOpacity(
  timed: TimedStroke,
  fadeDelaySeconds: number,
  now: number,
): number {
  // Kept_Ink never fades (Req 14.23).
  if (timed.stroke.kept) {
    return 1;
  }

  const delay = Number.isFinite(fadeDelaySeconds) && fadeDelaySeconds > 0 ? fadeDelaySeconds : 0;
  const elapsedSeconds = (now - timed.createdAt) / 1000;

  // Before the fade starts (including non-finite/earlier `now`): fully opaque.
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= delay) {
    return 1;
  }

  const fadeProgress = (elapsedSeconds - delay) / FADE_DURATION_SECONDS;
  // opacity ramps 1 -> 0 across the fade, then stays at 0.
  return clamp(1 - fadeProgress, 0, 1);
}

/**
 * Whether a Discussion_Ink stroke should be removed under the "fade out" policy
 * at time `now`.
 *
 * A stroke is removed once its fade completes: after the delay plus the full
 * FADE_DURATION_SECONDS has elapsed since `createdAt`. Kept_Ink is exempt and is
 * never removed (Req 14.23).
 *
 * When reduce-motion is active (Req 14.22) the stroke is removed without a fade
 * animation; the removal time is unchanged, so callers that honor reduce-motion
 * should skip the opacity ramp and just drop the stroke when this returns true.
 *
 * @param timed            The stroke and the time its contact ended.
 * @param fadeDelaySeconds The user-selected delay before fading begins.
 * @param now              The current time in epoch ms (injected clock).
 */
export function shouldRemoveFaded(
  timed: TimedStroke,
  fadeDelaySeconds: number,
  now: number,
): boolean {
  if (timed.stroke.kept) {
    return false;
  }

  const delay = Number.isFinite(fadeDelaySeconds) && fadeDelaySeconds > 0 ? fadeDelaySeconds : 0;
  const elapsedSeconds = (now - timed.createdAt) / 1000;
  if (!Number.isFinite(elapsedSeconds)) {
    return false;
  }

  return elapsedSeconds >= delay + FADE_DURATION_SECONDS;
}

/**
 * Apply the "fade out" policy to a set of timed Discussion_Ink strokes at time
 * `now`, returning which strokes remain and the opacity to render each one at.
 *
 * Kept_Ink passes through unchanged at opacity 1. Strokes whose fade has
 * completed are dropped; the rest are kept with their current opacity (1 before
 * the delay, ramping to 0 during the fade).
 *
 * @param strokes          The timed Discussion_Ink (and any Kept_Ink) strokes.
 * @param fadeDelaySeconds The user-selected delay before fading begins.
 * @param now              The current time in epoch ms (injected clock).
 * @returns The surviving strokes each paired with their current opacity.
 */
export function applyFadeOut(
  strokes: TimedStroke[],
  fadeDelaySeconds: number,
  now: number,
): Array<{ timed: TimedStroke; opacity: number }> {
  const result: Array<{ timed: TimedStroke; opacity: number }> = [];
  for (const timed of strokes) {
    if (shouldRemoveFaded(timed, fadeDelaySeconds, now)) {
      continue;
    }
    result.push({ timed, opacity: fadeOpacity(timed, fadeDelaySeconds, now) });
  }
  return result;
}

/**
 * Remove all Discussion_Ink on a step-change event under the
 * "clear-on-step-change" policy, keeping Kept_Ink (Req 14.21, 14.25).
 *
 * This is the pure reducer behind a step-change Transition start: it drops every
 * stroke whose `kept` flag is false and preserves the rest in their original
 * order and identity.
 *
 * @param strokes The current Ink_Strokes (Discussion_Ink and Kept_Ink).
 * @returns The strokes that survive the step change (Kept_Ink only).
 */
export function clearOnStepChange(strokes: InkStroke[]): InkStroke[] {
  return strokes.filter((stroke) => stroke.kept);
}

/**
 * Whether the active Ink_Clear_Policy removes all Discussion_Ink when a step
 * change (Transition start) occurs.
 *
 * Only "clear-on-step-change" clears on a step change; "keep-until-cleared" and
 * "fade-out" leave strokes untouched on step changes (Req 14.19, 14.21).
 */
export function policyClearsOnStepChange(policy: InkClearPolicy): boolean {
  return policy === 'clear-on-step-change';
}

/**
 * Resolve the Ink_Strokes that remain after a step-change event for a given
 * policy (Req 14.19, 14.21, 14.25).
 *
 *  - "clear-on-step-change": drop all Discussion_Ink, keep Kept_Ink.
 *  - "keep-until-cleared" / "fade-out": keep every stroke unchanged.
 *
 * @param policy  The active Ink_Clear_Policy.
 * @param strokes The current Ink_Strokes.
 * @returns The strokes that remain after the step change.
 */
export function strokesAfterStepChange(
  policy: InkClearPolicy,
  strokes: InkStroke[],
): InkStroke[] {
  if (policyClearsOnStepChange(policy)) {
    return clearOnStepChange(strokes);
  }
  return strokes.slice();
}
