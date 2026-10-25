import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INK_COLOR,
  DEFAULT_INK_WIDTH,
  INK_COLORS,
  INK_WIDTHS,
} from './InkPalette';
import { clearKeptInk } from './clearInk';
import { useDocumentStore, useHistoryStore } from '../state';
import type { InkStroke } from '../types';

/**
 * Unit tests for the Ink_Palette presets and the default clear-ink action.
 *
 * The presets must satisfy the counts/ranges in Req 14.2 (≥6 colours), Req 14.3
 * (colours + widths), and Req 14.6 (≥3 widths, all within 1..24 px). The
 * default clear-ink action must remove all Kept_Ink as a single undoable edit
 * (Req 14.18 / Req 11.8).
 */

describe('Ink_Palette presets', () => {
  it('offers at least six distinct colours (Req 14.2/14.3)', () => {
    expect(INK_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(INK_COLORS).size).toBe(INK_COLORS.length);
  });

  it('offers at least three widths, all within 1..24 px (Req 14.3/14.6)', () => {
    expect(INK_WIDTHS.length).toBeGreaterThanOrEqual(3);
    for (const w of INK_WIDTHS) {
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(24);
    }
  });

  it('exposes defaults drawn from the preset lists', () => {
    expect(INK_COLORS).toContain(DEFAULT_INK_COLOR);
    expect(INK_WIDTHS).toContain(DEFAULT_INK_WIDTH);
  });
});

const stroke = (kept: boolean): InkStroke => ({
  points: [{ x: 0, y: 0, pressure: 1 }],
  color: '#000',
  width: 2,
  kept,
});

describe('clearKeptInk (Req 14.18 / 11.8)', () => {
  beforeEach(() => {
    useDocumentStore.getState().reset();
    useHistoryStore.getState().clearHistory();
  });

  it('removes all Kept_Ink and records exactly one undoable action', () => {
    useDocumentStore.getState().update((d) => {
      d.keptInk = [stroke(true), stroke(true)];
    });

    expect(useHistoryStore.getState().canUndo).toBe(false);

    clearKeptInk();

    expect(useDocumentStore.getState().keptInk).toEqual([]);
    expect(useHistoryStore.getState().canUndo).toBe(true);
  });

  it('is reversible via undo (restores the cleared strokes)', () => {
    const before = [stroke(true)];
    useDocumentStore.getState().update((d) => {
      d.keptInk = before;
    });

    clearKeptInk();
    expect(useDocumentStore.getState().keptInk).toEqual([]);

    useHistoryStore.getState().undo();
    expect(useDocumentStore.getState().keptInk).toEqual(before);
  });
});
