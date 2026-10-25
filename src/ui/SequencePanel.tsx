/**
 * The Sequence side panel (task 14.1, Req 6.1, 6.2, 6.5).
 *
 * Shows the ordered Sequence of Steps. Each row carries:
 *  - a **thumbnail** (Req 6.1),
 *  - a derived **label** (Req 6.1, 6.2),
 *  - a drag handle for **reorder** (Req 6.2), and
 *  - a per-Step **speaker-note editor** (Req 6.5).
 *
 * ## Thumbnail choice (documented per Req 6.1)
 * A faithful bitmap thumbnail would require rendering each Step's target region
 * from the PDF/canvas, which is expensive and belongs to the rendering layers,
 * not the chrome. This panel instead renders a **cheap labelled mini-view**: a
 * small tile showing the Step's position number and the kind of item it
 * targets (focus / note / image / crop). This satisfies "a thumbnail + label
 * each" with a self-contained, testable placeholder; a later task can swap in a
 * real mini-render behind the same `thumbnail` slot without touching this panel.
 *
 * ## Labels are DERIVED (Req 6.2)
 * A Step's label is its 1-based position in the Sequence. Because the label is
 * computed from the live order here (and in `sequence/focusAreaLabel`), a
 * reorder via `moveStep(from, to)` updates every label automatically — there is
 * nothing to keep in sync.
 *
 * ## Store wiring vs. props
 * The panel reads the Sequence and item collections from the Document store so
 * it reflects every edit, and routes mutations through the Sequence store
 * actions (`moveStep`, `removeStepFromSequence`, `setStepSpeakerNote`) so each
 * is one undo entry. Clicking a Step calls the injected `onStepClick(index)`
 * (the app shell wires the camera animation in task 15.1). The speaker-note
 * value is read with `getSpeakerNote`.
 *
 * Drag-to-reorder uses the native HTML5 drag-and-drop API (draggable rows +
 * drop targets) and calls `moveStep(from, to)` on drop.
 */

import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../state';
import {
  getSpeakerNote,
  moveStep as moveStepAction,
  removeStepFromSequence as removeStepAction,
  setStepSpeakerNote as setSpeakerNoteAction,
} from '../sequence';
import type { DocumentState, Step } from '../types';

/** The kind of item a Step targets, for the mini-view label. */
type StepTargetKind = 'focus' | 'note' | 'image' | 'crop' | 'unknown';

/** Resolve what kind of item a Step references (pure over a DocumentState). */
export function stepTargetKind(doc: Pick<DocumentState,
  'focusAreas' | 'notes' | 'images' | 'crops'>, step: Step): StepTargetKind {
  if (doc.focusAreas.some((f) => f.id === step.itemId)) return 'focus';
  if (doc.notes.some((n) => n.id === step.itemId)) return 'note';
  if (doc.images.some((i) => i.id === step.itemId)) return 'image';
  if (doc.crops.some((c) => c.id === step.itemId)) return 'crop';
  return 'unknown';
}

const KIND_LABEL: Record<StepTargetKind, string> = {
  focus: 'Focus area',
  note: 'Note',
  image: 'Image',
  crop: 'Crop',
  unknown: 'Item',
};

export interface SequencePanelProps {
  /**
   * Click a Step to navigate/animate to it (Req 6.3). The app shell (task 15.1)
   * wires the camera animation; this panel only reports the index.
   */
  readonly onStepClick: (stepIndex: number) => void;
  /** Reorder action. Defaults to the Sequence store action (one undo entry). */
  readonly onMoveStep?: (fromIndex: number, toIndex: number) => void;
  /** Remove-from-sequence action. Defaults to the Sequence store action. */
  readonly onRemoveStep?: (stepId: string) => void;
  /** Speaker-note commit. Defaults to the Sequence store action. */
  readonly onSetSpeakerNote?: (stepId: string, text: string) => void;
}

const PANEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 260,
  height: '100%',
  background: '#fafafa',
  borderLeft: '1px solid #d1d5db',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  overflowY: 'auto',
};

const HEADER_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 600,
  color: '#374151',
  borderBottom: '1px solid #e5e7eb',
  position: 'sticky',
  top: 0,
  background: '#fafafa',
};

/**
 * The Sequence side panel. Reads the Sequence from the Document store and
 * routes mutations through the Sequence store actions.
 */
export function SequencePanel(props: SequencePanelProps) {
  const {
    onStepClick,
    onMoveStep = moveStepAction,
    onRemoveStep = removeStepAction,
    onSetSpeakerNote = setSpeakerNoteAction,
  } = props;

  const doc = useDocumentStore((s) => s);
  const sequence = doc.sequence;

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      onMoveStep(dragIndex, toIndex);
    }
    setDragIndex(null);
  };

  return (
    <aside className="sequence-panel" aria-label="Sequence" style={PANEL_STYLE}>
      <div className="sequence-panel__header" style={HEADER_STYLE}>
        Sequence ({sequence.length})
      </div>
      {sequence.length === 0 ? (
        <p className="sequence-panel__empty" style={{ padding: '10px', color: '#6b7280' }}>
          No steps yet. Create a focus area, note, image, or crop to add a step.
        </p>
      ) : (
        <ol className="sequence-panel__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sequence.map((step, index) => (
            <StepRow
              key={step.id}
              step={step}
              index={index}
              kind={stepTargetKind(doc, step)}
              note={getSpeakerNote(doc, step.id) ?? ''}
              onClick={() => onStepClick(index)}
              onRemove={() => onRemoveStep(step.id)}
              onNoteCommit={(text) => onSetSpeakerNote(step.id, text)}
              onDragStart={() => setDragIndex(index)}
              onDragOverRow={(e) => e.preventDefault()}
              onDropRow={() => handleDrop(index)}
              isDragging={dragIndex === index}
            />
          ))}
        </ol>
      )}
    </aside>
  );
}

interface StepRowProps {
  readonly step: Step;
  readonly index: number;
  readonly kind: StepTargetKind;
  readonly note: string;
  readonly onClick: () => void;
  readonly onRemove: () => void;
  readonly onNoteCommit: (text: string) => void;
  readonly onDragStart: () => void;
  readonly onDragOverRow: (e: React.DragEvent) => void;
  readonly onDropRow: () => void;
  readonly isDragging: boolean;
}

/** A single Step row: thumbnail mini-view + label + note editor + controls. */
function StepRow(props: StepRowProps) {
  const {
    step,
    index,
    kind,
    note,
    onClick,
    onRemove,
    onNoteCommit,
    onDragStart,
    onDragOverRow,
    onDropRow,
    isDragging,
  } = props;

  // Local draft so typing is responsive; commit on blur so each edit is one
  // undo entry (consistent with Note editing in the ItemLayer).
  const [draft, setDraft] = useState(note);
  const focusedRef = useRef(false);

  // Resync the draft when the committed note changes externally (e.g. undo/
  // redo), but never while this row's textarea is focused mid-edit.
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(note);
    }
  }, [note]);

  const label = index + 1;

  return (
    <li
      className="sequence-panel__step"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid #e5e7eb',
        background: isDragging ? '#eff6ff' : 'transparent',
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="sequence-panel__drag-handle"
          aria-hidden
          title="Drag to reorder"
          style={{ cursor: 'grab', color: '#9ca3af', fontSize: 16, lineHeight: 1 }}
        >
          {'\u2630'}
        </span>
        <button
          type="button"
          className="sequence-panel__thumbnail"
          onClick={onClick}
          title={`Go to step ${label}: ${KIND_LABEL[kind]}`}
          aria-label={`Go to step ${label}: ${KIND_LABEL[kind]}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            flex: '0 0 auto',
            borderRadius: 4,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{label}</span>
          <span style={{ fontSize: 9, color: '#6b7280' }}>{KIND_LABEL[kind]}</span>
        </button>
        <span className="sequence-panel__label" style={{ flex: 1, color: '#374151' }}>
          Step {label} &middot; {KIND_LABEL[kind]}
        </span>
        <button
          type="button"
          className="sequence-panel__remove"
          onClick={onRemove}
          title="Remove from sequence (keeps the item)"
          aria-label={`Remove step ${label} from sequence`}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: '#ffffff',
            cursor: 'pointer',
            color: '#b91c1c',
            padding: '2px 6px',
            font: 'inherit',
          }}
        >
          {'\u2715'}
        </button>
      </div>
      <label className="sequence-panel__note-label" style={{ display: 'block' }}>
        <span style={{ display: 'none' }}>Speaker note for step {label}</span>
        <textarea
          className="sequence-panel__note"
          data-step-note={step.id}
          aria-label={`Speaker note for step ${label}`}
          placeholder={'Speaker note\u2026'}
          value={draft}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            focusedRef.current = false;
            if (draft !== note) {
              onNoteCommit(draft);
            }
          }}
          rows={2}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            borderRadius: 4,
            border: '1px solid #d1d5db',
            padding: 4,
            font: 'inherit',
            fontSize: 12,
          }}
        />
      </label>
    </li>
  );
}
