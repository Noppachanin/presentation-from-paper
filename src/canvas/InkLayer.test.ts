import { describe, expect, it } from 'vitest';
import { drawInk } from './InkLayer';
import type { Camera, InkStroke } from '../types';

/**
 * Unit tests for the pure {@link drawInk} painter (task 13.2). A recording 2D
 * context stub captures the drawing calls so we can assert on *behavior*: that
 * the camera transform is applied, multi-point strokes stroke segments, a
 * single-point stroke renders a dot (arc+fill), and the hover cursor draws a
 * ring only when supplied.
 */

interface RecordedCall {
  readonly op: string;
  readonly args: readonly number[];
}

function makeCtx() {
  const calls: RecordedCall[] = [];
  const ctx = {
    canvas: { width: 1600, height: 1200 },
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
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
    arc(...a: number[]) {
      calls.push({ op: 'arc', args: a });
    },
    fill() {
      calls.push({ op: 'fill', args: [] });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 };

function multiPointStroke(kept: boolean): InkStroke {
  return {
    points: [
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ],
    color: '#ff0000',
    width: 4,
    kept,
  };
}

describe('drawInk', () => {
  it('clears and applies the camera transform each frame', () => {
    const { ctx, calls } = makeCtx();
    drawInk(ctx, {
      keptInk: [],
      discussionInk: [],
      camera: { panX: 5, panY: 7, zoom: 2 },
      dpr: 1,
      inProgressStroke: null,
      hoverCursor: null,
    });

    expect(calls.some((c) => c.op === 'clearRect')).toBe(true);
    expect(calls).toContainEqual({ op: 'translate', args: [-10, -14] });
    expect(calls).toContainEqual({ op: 'scale', args: [2, 2] });
  });

  it('strokes line segments for a multi-point stroke', () => {
    const { ctx, calls } = makeCtx();
    drawInk(ctx, {
      keptInk: [multiPointStroke(true)],
      discussionInk: [],
      camera: CAMERA,
      dpr: 1,
      inProgressStroke: null,
      hoverCursor: null,
    });

    // 3 points -> 2 segments -> 2 stroke() calls, no dot.
    expect(calls.filter((c) => c.op === 'stroke').length).toBe(2);
    expect(calls.some((c) => c.op === 'arc')).toBe(false);
  });

  it('renders a single-point stroke as a dot (arc + fill)', () => {
    const { ctx, calls } = makeCtx();
    const dot: InkStroke = {
      points: [{ x: 30, y: 40, pressure: 1 }],
      color: '#00f',
      width: 6,
      kept: false,
    };
    drawInk(ctx, {
      keptInk: [],
      discussionInk: [dot],
      camera: CAMERA,
      dpr: 1,
      inProgressStroke: null,
      hoverCursor: null,
    });

    const arc = calls.find((c) => c.op === 'arc');
    expect(arc).toBeDefined();
    // Dot centered at the point with radius = base width / 2 (pressure 1).
    expect(arc?.args.slice(0, 3)).toEqual([30, 40, 3]);
    expect(calls.some((c) => c.op === 'fill')).toBe(true);
  });

  it('draws the in-progress stroke above committed strokes', () => {
    const { ctx, calls } = makeCtx();
    drawInk(ctx, {
      keptInk: [],
      discussionInk: [],
      camera: CAMERA,
      dpr: 1,
      inProgressStroke: multiPointStroke(false),
      hoverCursor: null,
    });
    expect(calls.filter((c) => c.op === 'stroke').length).toBe(2);
  });

  it('draws a hover cursor ring only when supplied', () => {
    const without = makeCtx();
    drawInk(without.ctx, {
      keptInk: [],
      discussionInk: [],
      camera: CAMERA,
      dpr: 1,
      inProgressStroke: null,
      hoverCursor: null,
    });
    expect(without.calls.some((c) => c.op === 'arc')).toBe(false);

    const withCursor = makeCtx();
    drawInk(withCursor.ctx, {
      keptInk: [],
      discussionInk: [],
      camera: CAMERA,
      dpr: 1,
      inProgressStroke: null,
      hoverCursor: { point: { x: 10, y: 20 }, widthScreenPx: 8 },
    });
    const ring = withCursor.calls.find((c) => c.op === 'arc');
    expect(ring).toBeDefined();
    // radius = widthScreenPx / 2 / zoom = 8 / 2 / 1 = 4, centered at hover point.
    expect(ring?.args.slice(0, 3)).toEqual([10, 20, 4]);
  });
});
