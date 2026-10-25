import { describe, expect, it } from 'vitest';
import { drawOverlay } from './OverlayLayer';
import type { OverlayDocument } from './OverlayLayer';
import type { Camera, PagePlacement } from '../types';

/**
 * Unit tests for the pure {@link drawOverlay} painter (task 13.2). The real 2D
 * context is not available under jsdom, so these drive a minimal recording stub
 * that captures the drawing calls we assert on (stroked rects, lines, labels)
 * plus the transform/clear bookkeeping. This keeps the tests about *behavior*
 * (what is drawn, and the Present_Mode visibility rules) without mocking the
 * layer's own logic.
 */

interface RecordedCall {
  readonly op: string;
  readonly args: readonly number[];
  readonly text?: string;
}

/** A recording 2D-context stub that captures the calls drawOverlay makes. */
function makeCtx() {
  const calls: RecordedCall[] = [];
  const ctx = {
    canvas: { width: 1600, height: 1200 },
    // state we do not assert on but must exist
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    font: '',
    textBaseline: '',
    save() {},
    restore() {},
    setTransform(...a: number[]) {
      calls.push({ op: 'setTransform', args: a });
    },
    clearRect(...a: number[]) {
      calls.push({ op: 'clearRect', args: a });
    },
    translate(...a: number[]) {
      calls.push({ op: 'translate', args: a });
    },
    scale(...a: number[]) {
      calls.push({ op: 'scale', args: a });
    },
    strokeRect(...a: number[]) {
      calls.push({ op: 'strokeRect', args: a });
    },
    fillRect(...a: number[]) {
      calls.push({ op: 'fillRect', args: a });
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ op: 'fillText', args: [x, y], text });
    },
    measureText(text: string) {
      return { width: text.length * 7 };
    },
    beginPath() {
      calls.push({ op: 'beginPath', args: [] });
    },
    moveTo(...a: number[]) {
      calls.push({ op: 'moveTo', args: a });
    },
    lineTo(...a: number[]) {
      calls.push({ op: 'lineTo', args: a });
    },
    stroke() {
      calls.push({ op: 'stroke', args: [] });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const PAGE: PagePlacement = {
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 1000, height: 1000 },
  pageWidth: 1000,
  pageHeight: 1000,
};

const CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 };

/** A document with one Focus_Area (in the sequence) and no connectors. */
function docWithFocus(): OverlayDocument {
  return {
    pages: [PAGE],
    focusAreas: [{ id: 'f1', pageIndex: 0, rect: { x: 100, y: 100, width: 200, height: 150 } }],
    notes: [],
    images: [],
    crops: [],
    connectors: [],
    sequence: [{ id: 's1', itemId: 'f1' }],
  };
}

describe('drawOverlay', () => {
  it('clears and applies the camera transform each frame', () => {
    const { ctx, calls } = makeCtx();
    drawOverlay(ctx, {
      doc: docWithFocus(),
      camera: { panX: 10, panY: 20, zoom: 2 },
      dpr: 1,
      mode: 'edit',
      currentStepIndex: 0,
      selectedId: null,
    });

    expect(calls.some((c) => c.op === 'clearRect')).toBe(true);
    // translate(-pan*zoom) then scale(zoom)
    expect(calls).toContainEqual({ op: 'translate', args: [-20, -40] });
    expect(calls).toContainEqual({ op: 'scale', args: [2, 2] });
  });

  it('draws a Focus_Area outline at page->canvas coords with its position label', () => {
    const { ctx, calls } = makeCtx();
    drawOverlay(ctx, {
      doc: docWithFocus(),
      camera: CAMERA,
      dpr: 1,
      mode: 'edit',
      currentStepIndex: 0,
      selectedId: null,
    });

    // Focus rect is in page coords == canvas coords here (1:1 placement).
    expect(calls).toContainEqual({ op: 'strokeRect', args: [100, 100, 200, 150] });
    // Label "1" (1-based sequence position) is drawn as text.
    const label = calls.find((c) => c.op === 'fillText');
    expect(label?.text).toBe('1');
  });

  it('draws connectors between computed endpoints in edit mode', () => {
    const { ctx, calls } = makeCtx();
    const doc: OverlayDocument = {
      ...docWithFocus(),
      notes: [{ id: 'n1', rect: { x: 500, y: 500, width: 100, height: 60 }, text: '' }],
      connectors: [{ id: 'c1', fromItemId: 'n1', toTargetId: 'f1' }],
    };
    drawOverlay(ctx, {
      doc,
      camera: CAMERA,
      dpr: 1,
      mode: 'edit',
      currentStepIndex: 0,
      selectedId: null,
    });

    expect(calls.some((c) => c.op === 'moveTo')).toBe(true);
    expect(calls.some((c) => c.op === 'lineTo')).toBe(true);
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
  });

  it('draws selection handles only in edit mode for the selected id', () => {
    // Select a Note (not in the sequence) so there is no label pill fillRect to
    // confound the handle count; a selected item draws exactly 8 handles.
    const doc: OverlayDocument = {
      pages: [PAGE],
      focusAreas: [],
      notes: [{ id: 'n1', rect: { x: 100, y: 100, width: 120, height: 80 }, text: '' }],
      images: [],
      crops: [],
      connectors: [],
      sequence: [],
    };

    const edit = makeCtx();
    drawOverlay(edit.ctx, {
      doc,
      camera: CAMERA,
      dpr: 1,
      mode: 'edit',
      currentStepIndex: 0,
      selectedId: 'n1',
    });
    // 8 handles are filled as small squares.
    const handleFills = edit.calls.filter((c) => c.op === 'fillRect');
    expect(handleFills.length).toBe(8);

    const present = makeCtx();
    drawOverlay(present.ctx, {
      doc,
      camera: CAMERA,
      dpr: 1,
      mode: 'present',
      currentStepIndex: 0,
      selectedId: 'n1',
    });
    // No resize handles (no fillRect at all) in present mode.
    const presentHandleFills = present.calls.filter((c) => c.op === 'fillRect');
    expect(presentHandleFills.length).toBe(0);
  });

  it('hides non-current Focus_Areas and unrelated connectors in Present_Mode', () => {
    const { ctx, calls } = makeCtx();
    const doc: OverlayDocument = {
      pages: [PAGE],
      focusAreas: [
        { id: 'f1', pageIndex: 0, rect: { x: 100, y: 100, width: 200, height: 150 } },
        { id: 'f2', pageIndex: 0, rect: { x: 400, y: 400, width: 100, height: 100 } },
      ],
      notes: [{ id: 'n1', rect: { x: 700, y: 700, width: 80, height: 50 }, text: '' }],
      images: [],
      crops: [],
      connectors: [
        { id: 'c1', fromItemId: 'n1', toTargetId: 'f1' }, // attached to current target
        { id: 'c2', fromItemId: 'n1', toTargetId: 'f2' }, // not attached to current target
      ],
      sequence: [
        { id: 's1', itemId: 'f1' },
        { id: 's2', itemId: 'f2' },
      ],
    };

    // Current step index 0 -> target is f1.
    drawOverlay(ctx, {
      doc,
      camera: CAMERA,
      dpr: 1,
      mode: 'present',
      currentStepIndex: 0,
      selectedId: null,
    });

    // Only f1's outline is drawn (f2 hidden).
    const outlines = calls.filter((c) => c.op === 'strokeRect');
    expect(outlines).toEqual([{ op: 'strokeRect', args: [100, 100, 200, 150] }]);

    // Exactly one connector line (c1 → f1) is drawn; c2 is skipped.
    const lines = calls.filter((c) => c.op === 'lineTo');
    expect(lines.length).toBe(1);
  });
});
