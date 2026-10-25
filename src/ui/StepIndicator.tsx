/**
 * Present_Mode step indicator (task 14.2, Req 8.10).
 *
 * Shows "current step / total" in Present_Mode and fades out after 2 seconds of
 * no user input, reappearing on the next interaction (Req 8.10). The fade logic
 * lives in {@link useFadeAfter} (see `stepFade.ts`); the global input signal
 * that drives it is wired in task 15.1.
 *
 * ## Current step / total
 * By default it reads `currentStepIndex` from the Session store and the
 * Sequence length from the Document store, so it stays in sync as the presenter
 * navigates. Both can be overridden via props for testing / explicit wiring.
 * The displayed step number is 1-based (`index + 1`); with an empty Sequence it
 * shows `0 / 0`.
 *
 * ## Fade control
 * The component owns a {@link FadeController}: it exposes the controller's
 * `poke` through an imperative handle and also accepts an `activitySignal`
 * prop — whenever that value changes, the indicator pokes itself visible. Task
 * 15.1 can bump `activitySignal` (e.g. a counter incremented on any
 * Present_Mode input) to reset the fade without reaching into the component.
 */

import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useDocumentStore, useSessionStore } from '../state';
import { useFadeAfter, STEP_INDICATOR_FADE_MS } from './stepFade';

export interface StepIndicatorHandle {
  /** Show the indicator and reset the idle fade timer (Req 8.10). */
  poke: () => void;
}

export interface StepIndicatorProps {
  /**
   * Zero-based index of the current Step. Defaults to the Session store's
   * `currentStepIndex` so the indicator tracks navigation automatically.
   */
  readonly currentStepIndex?: number;
  /**
   * Total number of Steps. Defaults to the Document store's Sequence length.
   */
  readonly totalSteps?: number;
  /**
   * Any value that changes on user input; each change re-shows the indicator
   * and resets the fade timer (Req 8.10). Task 15.1 supplies a counter.
   */
  readonly activitySignal?: unknown;
  /** Idle delay before fading, in ms. Defaults to {@link STEP_INDICATOR_FADE_MS}. */
  readonly fadeMs?: number;
}

const INDICATOR_STYLE: React.CSSProperties = {
  position: 'absolute',
  // Sit inside the viewport safe area (Req 14.26) at the top centre.
  top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  borderRadius: 999,
  background: 'rgba(17, 24, 39, 0.72)',
  color: '#f9fafb',
  font: '13px/1.2 system-ui, sans-serif',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0.3,
  userSelect: 'none',
  pointerEvents: 'none',
  // Fade via opacity so the element stays mounted (reappears instantly on poke).
  transition: 'opacity 400ms ease',
  zIndex: 30,
};

/**
 * The fading "current / total" Step indicator for Present_Mode (Req 8.10).
 * Forwards a {@link StepIndicatorHandle} so callers can `poke()` imperatively.
 */
export const StepIndicator = forwardRef<StepIndicatorHandle, StepIndicatorProps>(
  function StepIndicator(props, ref) {
    const { activitySignal, fadeMs = STEP_INDICATOR_FADE_MS } = props;

    const storeIndex = useSessionStore((s) => s.currentStepIndex);
    const storeTotal = useDocumentStore((s) => s.sequence.length);

    const currentStepIndex = props.currentStepIndex ?? storeIndex;
    const totalSteps = props.totalSteps ?? storeTotal;

    const { visible, poke } = useFadeAfter(fadeMs);

    useImperativeHandle(ref, () => ({ poke }), [poke]);

    // Re-show whenever the activity signal changes (task 15.1 wires input here).
    useEffect(() => {
      if (activitySignal !== undefined) {
        poke();
      }
      // `poke` is stable from useCallback; only the signal should re-trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activitySignal]);

    const displayCurrent = totalSteps === 0 ? 0 : currentStepIndex + 1;

    return (
      <div
        className="step-indicator"
        role="status"
        aria-live="polite"
        aria-label={`Step ${displayCurrent} of ${totalSteps}`}
        style={{ ...INDICATOR_STYLE, opacity: visible ? 1 : 0 }}
      >
        {displayCurrent} / {totalSteps}
      </div>
    );
  },
);
