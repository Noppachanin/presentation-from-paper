import { describe, expect, it } from 'vitest';
import type { Crop, FocusArea, ImageItem, Note, Step } from '../types';
import { stepTargetKind } from './SequencePanel';

/**
 * Unit test for the Sequence side-panel mini-view target-kind resolver
 * (Req 6.1): a Step's label shows which kind of item it targets.
 */

const focus: FocusArea = { id: 'f1', pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 } };
const note: Note = { id: 'n1', rect: { x: 0, y: 0, width: 10, height: 10 }, text: '' };
const image: ImageItem = { id: 'i1', rect: { x: 0, y: 0, width: 10, height: 10 }, dataURL: 'data:,' };
const crop: Crop = {
  id: 'c1',
  sourcePageIndex: 0,
  sourceRect: { x: 0, y: 0, width: 10, height: 10 },
  rect: { x: 0, y: 0, width: 10, height: 10 },
};

const doc = {
  focusAreas: [focus],
  notes: [note],
  images: [image],
  crops: [crop],
};

const stepFor = (itemId: string): Step => ({ id: `s-${itemId}`, itemId });

describe('stepTargetKind', () => {
  it('classifies each referenced item kind', () => {
    expect(stepTargetKind(doc, stepFor('f1'))).toBe('focus');
    expect(stepTargetKind(doc, stepFor('n1'))).toBe('note');
    expect(stepTargetKind(doc, stepFor('i1'))).toBe('image');
    expect(stepTargetKind(doc, stepFor('c1'))).toBe('crop');
  });

  it('returns "unknown" for a dangling reference', () => {
    expect(stepTargetKind(doc, stepFor('missing'))).toBe('unknown');
  });
});
