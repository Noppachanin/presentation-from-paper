/**
 * The Ink_Palette (task 14.2).
 *
 * The compact control group that provides the ink controls in Present_Mode
 * (glossary "Ink_Palette"; Req 8.1 shows it on entering Present_Mode). It is a
 * floating overlay positioned inside the viewport safe area (Req 14.26) and is
 * collapsible to a single button so it never covers content.
 *
 * ## Controls (and their requirements)
 *  - **Ink / Eraser tool toggles** (Req 14.14 / glossary): call
 *    `setActiveTool('ink' | 'eraser')` on the Session store; the active tool is
 *    marked `aria-pressed`.
 *  - **Colour picker** — at least {@link INK_COLORS} preset colours (Req 14.2 /
 *    14.3). The *selected* colour is UI state surfaced via `color` /
 *    `onColorChange`, with an internal fallback when uncontrolled.
 *  - **Width picker** — at least 3 options in the 1..24 px range
 *    ({@link INK_WIDTHS}, Req 14.3 / 14.6). Surfaced via `width` /
 *    `onWidthChange`, uncontrolled fallback otherwise.
 *  - **Keep-ink toggle** (Req 14.23) — bound to `keepInkToggle` /
 *    `setKeepInkToggle`; when on, new strokes become Kept_Ink.
 *  - **Ink undo / redo** (Req 11.10 / 11.11) — wired to the history store,
 *    disabled via `canUndo` / `canRedo`. Available in Present_Mode.
 *  - **Clear ink** (Req 14.18) — calls `onClearInk`, defaulting to
 *    {@link clearKeptInk} (records clearing Kept_Ink as one undo unit).
 *  - **Previous / Next step** (Req 8.11) — wired to `prevStep` / `nextStep`,
 *    disabled via `canPrev` / `canNext`.
 *
 * ## Selected colour / width ownership
 * The Session / Document stores have no "current ink colour/width" field. The
 * palette therefore owns the *selected* colour and width as component state and
 * exposes them through props/callbacks (`color`, `onColorChange`, `width`,
 * `onWidthChange`) with sensible defaults. Task 15.1 reads the selected
 * colour/width when it builds an Ink_Stroke from Pen_Input; this component only
 * surfaces them.
 *
 * ## Collapsing (Req 14.26)
 * When collapsed, only a single toggle button shows (expanding the palette);
 * the ink controls are hidden. Ink_Strokes stay visible because rendering is
 * the InkLayer's job — the palette only hides its own chrome. The whole overlay
 * is positioned with `env(safe-area-inset-*)` so it sits inside the safe area.
 *
 * Presentational by design: side effects go through the stores (tool, keep-ink,
 * undo/redo) and the navigation helpers, or through the `onClearInk` callback,
 * so task 15.1 can override behaviour without reshaping the palette.
 */

import { useState } from 'react';
import { useDocumentStore, useHistoryStore, useSessionStore } from '../state';
import { canNext, canPrev, nextStep, prevStep } from '../sequence';
import { clearKeptInk } from './clearInk';

/** The preset ink colours (Req 14.2/14.3 — at least six). */
export const INK_COLORS: readonly string[] = [
  '#111827', // near-black
  '#ef4444', // red
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ffffff', // white
];

/** The preset stroke widths in screen px, all within 1..24 (Req 14.3/14.6). */
export const INK_WIDTHS: readonly number[] = [2, 4, 8, 16];

/** Default selected colour when the palette is uncontrolled. */
export const DEFAULT_INK_COLOR = INK_COLORS[0];
/** Default selected width (px) when the palette is uncontrolled. */
export const DEFAULT_INK_WIDTH = INK_WIDTHS[1];

export interface InkPaletteProps {
  /** Currently selected ink colour (controlled). Defaults internally when omitted. */
  readonly color?: string;
  /** Called when the user picks a colour (Req 14.2). */
  readonly onColorChange?: (color: string) => void;
  /** Currently selected stroke width in px (controlled). Defaults internally. */
  readonly width?: number;
  /** Called when the user picks a width (Req 14.6). */
  readonly onWidthChange?: (width: number) => void;
  /**
   * Clear-ink handler (Req 14.18). Defaults to {@link clearKeptInk}, which
   * records clearing all Kept_Ink as a single undo unit. Task 15.1 passes a
   * handler that also removes transient Discussion_Ink.
   */
  readonly onClearInk?: () => void;
  /** Start collapsed (single button). Defaults to expanded. */
  readonly defaultCollapsed?: boolean;
}

const WRAP_STYLE: React.CSSProperties = {
  position: 'absolute',
  // Pin to the bottom-centre inside the safe area (Req 14.26).
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 40,
  fontFamily: 'system-ui, sans-serif',
};

const PANEL_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 12,
  background: 'rgba(17, 24, 39, 0.85)',
  color: '#f9fafb',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
  backdropFilter: 'blur(6px)',
  maxWidth: '96vw',
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const GROUP_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const SEP_STYLE: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'rgba(255, 255, 255, 0.2)',
  margin: '0 2px',
};

const COLLAPSED_BUTTON_STYLE: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(17, 24, 39, 0.85)',
  color: '#f9fafb',
  cursor: 'pointer',
  fontSize: 18,
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
};

/** A compact icon/label button used throughout the palette. */
function PaletteButton(props: {
  readonly label: string;
  readonly title: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  const { label, title, pressed, disabled, onClick, className } = props;
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: 32,
        height: 32,
        padding: '0 8px',
        borderRadius: 6,
        border: '1px solid',
        borderColor: pressed ? '#60a5fa' : 'rgba(255, 255, 255, 0.25)',
        background: disabled
          ? 'rgba(255, 255, 255, 0.06)'
          : pressed
            ? 'rgba(96, 165, 250, 0.3)'
            : 'rgba(255, 255, 255, 0.1)',
        color: disabled ? 'rgba(249, 250, 251, 0.4)' : '#f9fafb',
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: 'inherit',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}

/**
 * The Ink_Palette. Reads tool / keep-ink state and undo/redo availability from
 * the stores; routes clear-ink through `onClearInk` and step navigation through
 * the sequence helpers. Selected colour/width are surfaced via props/callbacks.
 */
export function InkPalette(props: InkPaletteProps) {
  const {
    onColorChange,
    onWidthChange,
    onClearInk = clearKeptInk,
    defaultCollapsed = false,
  } = props;

  // Session: active tool + keep-ink toggle.
  const activeTool = useSessionStore((s) => s.activeTool);
  const setActiveTool = useSessionStore((s) => s.setActiveTool);
  const keepInkToggle = useSessionStore((s) => s.keepInkToggle);
  const setKeepInkToggle = useSessionStore((s) => s.setKeepInkToggle);

  // History: ink undo / redo (Req 11.10 / 11.11).
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  // Sequence navigation (Req 8.11).
  const currentStepIndex = useSessionStore((s) => s.currentStepIndex);
  const sequenceLength = useDocumentStore((s) => s.sequence.length);

  // Selected colour / width: controlled via props, uncontrolled fallback here.
  const [localColor, setLocalColor] = useState(DEFAULT_INK_COLOR);
  const [localWidth, setLocalWidth] = useState(DEFAULT_INK_WIDTH);
  const color = props.color ?? localColor;
  const width = props.width ?? localWidth;

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const selectColor = (c: string) => {
    if (props.color === undefined) {
      setLocalColor(c);
    }
    onColorChange?.(c);
  };

  const selectWidth = (w: number) => {
    if (props.width === undefined) {
      setLocalWidth(w);
    }
    onWidthChange?.(w);
  };

  if (collapsed) {
    return (
      <div className="ink-palette ink-palette--collapsed" style={WRAP_STYLE}>
        <button
          type="button"
          className="ink-palette__expand"
          title="Show ink tools"
          aria-label="Show ink tools"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
          style={COLLAPSED_BUTTON_STYLE}
        >
          {'\u270E'}
        </button>
      </div>
    );
  }

  return (
    <div
      className="ink-palette"
      role="toolbar"
      aria-label="Ink palette"
      style={WRAP_STYLE}
    >
      <div style={PANEL_STYLE}>
        {/* Collapse to a single button (Req 14.26). */}
        <PaletteButton
          className="ink-palette__collapse"
          label={'\u2715'}
          title="Hide ink tools"
          onClick={() => setCollapsed(true)}
        />

        <div style={SEP_STYLE} aria-hidden />

        {/* Tool toggles (Req 14.14). */}
        <div className="ink-palette__tools" style={GROUP_STYLE}>
          <PaletteButton
            className="ink-palette__ink"
            label="Ink"
            title="Ink tool"
            pressed={activeTool === 'ink'}
            onClick={() => setActiveTool('ink')}
          />
          <PaletteButton
            className="ink-palette__eraser"
            label="Erase"
            title="Eraser tool"
            pressed={activeTool === 'eraser'}
            onClick={() => setActiveTool('eraser')}
          />
        </div>

        <div style={SEP_STYLE} aria-hidden />

        {/* Colour picker — at least six presets (Req 14.2/14.3). */}
        <div
          className="ink-palette__colors"
          role="radiogroup"
          aria-label="Ink color"
          style={GROUP_STYLE}
        >
          {INK_COLORS.map((c) => {
            const selected = c === color;
            return (
              <button
                key={c}
                type="button"
                className="ink-palette__color"
                role="radio"
                aria-checked={selected}
                aria-label={`Color ${c}`}
                title={c}
                onClick={() => selectColor(c)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: c,
                  border: selected
                    ? '2px solid #ffffff'
                    : '2px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: selected ? '0 0 0 2px #60a5fa' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            );
          })}
        </div>

        <div style={SEP_STYLE} aria-hidden />

        {/* Width picker — at least three options in 1..24 px (Req 14.3/14.6). */}
        <div
          className="ink-palette__widths"
          role="radiogroup"
          aria-label="Stroke width"
          style={GROUP_STYLE}
        >
          {INK_WIDTHS.map((w) => {
            const selected = w === width;
            return (
              <button
                key={w}
                type="button"
                className="ink-palette__width"
                role="radio"
                aria-checked={selected}
                aria-label={`Width ${w} pixels`}
                title={`${w} px`}
                onClick={() => selectWidth(w)}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  border: selected
                    ? '1px solid #60a5fa'
                    : '1px solid rgba(255, 255, 255, 0.25)',
                  background: selected
                    ? 'rgba(96, 165, 250, 0.3)'
                    : 'rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'block',
                    width: Math.min(w, 20),
                    height: Math.min(w, 20),
                    borderRadius: 999,
                    background: '#f9fafb',
                  }}
                />
              </button>
            );
          })}
        </div>

        <div style={SEP_STYLE} aria-hidden />

        {/* Keep-ink toggle (Req 14.23). */}
        <PaletteButton
          className="ink-palette__keep"
          label="Keep"
          title={
            keepInkToggle
              ? 'Keep ink on: new strokes are saved'
              : 'Keep ink off: new strokes are temporary'
          }
          pressed={keepInkToggle}
          onClick={() => setKeepInkToggle(!keepInkToggle)}
        />

        <div style={SEP_STYLE} aria-hidden />

        {/* Ink undo / redo (Req 11.10 / 11.11). */}
        <div className="ink-palette__history" style={GROUP_STYLE}>
          <PaletteButton
            className="ink-palette__undo"
            label={'\u21B6'}
            title="Undo ink"
            disabled={!canUndo}
            onClick={undo}
          />
          <PaletteButton
            className="ink-palette__redo"
            label={'\u21B7'}
            title="Redo ink"
            disabled={!canRedo}
            onClick={redo}
          />
        </div>

        <div style={SEP_STYLE} aria-hidden />

        {/* Clear ink (Req 14.18). */}
        <PaletteButton
          className="ink-palette__clear"
          label="Clear"
          title="Clear ink"
          onClick={onClearInk}
        />

        <div style={SEP_STYLE} aria-hidden />

        {/* Previous / Next step (Req 8.11). */}
        <div className="ink-palette__nav" style={GROUP_STYLE}>
          <PaletteButton
            className="ink-palette__prev"
            label={'\u2039'}
            title="Previous step"
            disabled={!canPrev(currentStepIndex, sequenceLength)}
            onClick={prevStep}
          />
          <PaletteButton
            className="ink-palette__next"
            label={'\u203A'}
            title="Next step"
            disabled={!canNext(currentStepIndex, sequenceLength)}
            onClick={nextStep}
          />
        </div>
      </div>
    </div>
  );
}
