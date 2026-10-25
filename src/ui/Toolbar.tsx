/**
 * The Toolbar (task 14.1, Req 2.5, 2.6, 11.12).
 *
 * The top chrome bar of the editor. It is deliberately **presentational**: it
 * reads the active tool, live Camera, page placements, and history availability
 * from the stores (so it stays in sync with every edit) but exposes everything
 * else through typed callbacks so the app shell (task 15.1) can wire the actual
 * fit-page-width animation, present-mode switch, and open/load/save
 * orchestration.
 *
 * ## What it renders
 *  - **Tool buttons** (Req 2.5): one button per editing {@link Tool}. Clicking a
 *    button calls `setActiveTool` on the Session store; the current tool is
 *    marked `aria-pressed`. The ink/eraser tools also live here so the Toolbar
 *    is a complete tool switcher; the dedicated Ink_Palette (task 14.2) offers
 *    the colour/width controls on top of the same Session tool.
 *  - **Zoom % readout** (Req 2.6): `round(zoom*100)` from the live Camera.
 *  - **Current page number** (Req 2.6): the page under the viewport centre.
 *  - **Fit-page-width** (Req 2.5): a button invoking `onFitPageWidth()`; the
 *    camera animation itself is task 15.1.
 *  - **Undo / Redo** (Req 11.12): wired to the history store, disabled via the
 *    reactive `canUndo` / `canRedo` flags.
 *  - **Present**: a button invoking `onPresent()`; mode/keyboard wiring is 15.1.
 *  - **Open PDF / Load / Save**: buttons invoking the matching callbacks so the
 *    shell can open the corresponding dialogs / file flows.
 *
 * Camera, viewport, and store values are taken from the stores by default but
 * can be injected for testing via props.
 */

import { useHistoryStore, useSessionStore } from '../state';
import { useDocumentStore } from '../state';
import type { Tool, Viewport } from '../types';
import { currentPageNumber, zoomPercent } from './currentPage';

/** A selectable tool plus its human label (order defines button order). */
interface ToolButtonSpec {
  readonly tool: Tool;
  readonly label: string;
  readonly title: string;
}

/** The editing tools surfaced on the Toolbar (Req 2.5). */
export const TOOLBAR_TOOLS: readonly ToolButtonSpec[] = [
  { tool: 'pan', label: 'Pan', title: 'Pan / select (V)' },
  { tool: 'focus', label: 'Focus', title: 'Draw a focus area' },
  { tool: 'note', label: 'Note', title: 'Add a text note' },
  { tool: 'image', label: 'Image', title: 'Add an image' },
  { tool: 'crop', label: 'Crop', title: 'Crop a page region' },
  { tool: 'connector', label: 'Connector', title: 'Connect two items' },
  { tool: 'ink', label: 'Ink', title: 'Draw ink' },
  { tool: 'eraser', label: 'Eraser', title: 'Erase ink' },
];

export interface ToolbarProps {
  /**
   * The viewport size (screen px) used to compute the current page number.
   * Supplied by the app shell; required so the readout matches what is visible.
   */
  readonly viewport: Viewport;
  /** Fit the current page to the viewport width (Req 2.5). Animation is 15.1. */
  readonly onFitPageWidth: () => void;
  /** Enter Present_Mode. Mode/keyboard wiring is task 15.1. */
  readonly onPresent: () => void;
  /** Open the "open PDF" file flow / dialog. Orchestration is task 15.1. */
  readonly onOpenPdf: () => void;
  /** Open the "load presentation" file flow / dialog. Orchestration is 15.1. */
  readonly onLoadPresentation: () => void;
  /** Save the current presentation to a Presentation_File. */
  readonly onSave: () => void;
  /**
   * Whether Present_Mode can be entered. The shell disables it when there are
   * no Steps (Req 8 — enforced in 15.1); defaults to enabled here.
   */
  readonly canPresent?: boolean;
}

const BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 10px',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  userSelect: 'none',
};

const GROUP_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const SEP_STYLE: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: '#d1d5db',
  margin: '0 4px',
};

const READOUT_STYLE: React.CSSProperties = {
  minWidth: 56,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  color: '#374151',
};

/** A single toolbar button with pressed/disabled state styling. */
function ToolbarButton(props: {
  readonly label: string;
  readonly title: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  const { label, title, pressed, disabled, onClick } = props;
  return (
    <button
      type="button"
      className="toolbar__button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid',
        borderColor: pressed ? '#2563eb' : '#d1d5db',
        background: disabled ? '#e5e7eb' : pressed ? '#dbeafe' : '#ffffff',
        color: disabled ? '#9ca3af' : '#111827',
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

/**
 * The editor Toolbar. Reads the active tool, Camera, pages, and undo/redo
 * availability from the stores; routes actions through props so the app shell
 * owns the side effects (task 15.1).
 */
export function Toolbar(props: ToolbarProps) {
  const {
    viewport,
    onFitPageWidth,
    onPresent,
    onOpenPdf,
    onLoadPresentation,
    onSave,
    canPresent = true,
  } = props;

  const activeTool = useSessionStore((s) => s.activeTool);
  const setActiveTool = useSessionStore((s) => s.setActiveTool);
  const camera = useSessionStore((s) => s.camera);

  const pages = useDocumentStore((s) => s.pages);

  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const pageNumber = currentPageNumber(camera, viewport, pages);
  const zoom = zoomPercent(camera);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor toolbar" style={BAR_STYLE}>
      <div className="toolbar__group toolbar__group--files" style={GROUP_STYLE}>
        <ToolbarButton label="Open PDF" title="Open a PDF" onClick={onOpenPdf} />
        <ToolbarButton label="Load" title="Load a presentation file" onClick={onLoadPresentation} />
        <ToolbarButton label="Save" title="Save the presentation" onClick={onSave} />
      </div>

      <div style={SEP_STYLE} aria-hidden />

      <div className="toolbar__group toolbar__group--tools" style={GROUP_STYLE}>
        {TOOLBAR_TOOLS.map((spec) => (
          <ToolbarButton
            key={spec.tool}
            label={spec.label}
            title={spec.title}
            pressed={activeTool === spec.tool}
            onClick={() => setActiveTool(spec.tool)}
          />
        ))}
      </div>

      <div style={SEP_STYLE} aria-hidden />

      <div className="toolbar__group toolbar__group--view" style={GROUP_STYLE}>
        <ToolbarButton
          label="Fit width"
          title="Fit the page to the viewport width"
          onClick={onFitPageWidth}
        />
        <span
          className="toolbar__zoom"
          style={READOUT_STYLE}
          aria-label={`Zoom ${zoom} percent`}
        >
          {zoom}%
        </span>
        <span
          className="toolbar__page"
          style={READOUT_STYLE}
          aria-label={pageNumber === undefined ? 'No page' : `Page ${pageNumber}`}
        >
          {pageNumber === undefined ? 'Page \u2013' : `Page ${pageNumber}`}
        </span>
      </div>

      <div style={SEP_STYLE} aria-hidden />

      <div className="toolbar__group toolbar__group--history" style={GROUP_STYLE}>
        <ToolbarButton label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <ToolbarButton label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo} />
      </div>

      <div style={SEP_STYLE} aria-hidden />

      <div className="toolbar__group toolbar__group--present" style={GROUP_STYLE}>
        <ToolbarButton
          label="Present"
          title={canPresent ? 'Enter present mode' : 'Add a step to present'}
          disabled={!canPresent}
          onClick={onPresent}
        />
      </div>
    </div>
  );
}
