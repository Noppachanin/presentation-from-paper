import { describe, expect, it } from 'vitest';
import type { Camera, PagePlacement, Viewport } from '../types';
import {
  currentPageIndex,
  currentPageNumber,
  viewportCenterCanvas,
  zoomPercent,
} from './currentPage';

/**
 * Unit tests for the Toolbar readout helpers (Req 2.6): the zoom percentage and
 * the current-page computation (the page under the viewport centre).
 */

const viewport: Viewport = { width: 800, height: 600 };

/** Two stacked pages with a 20px gap: page 0 at y=0..1000, page 1 at y=1020..2020. */
function twoPages(): PagePlacement[] {
  return [
    { pageIndex: 0, rect: { x: 0, y: 0, width: 800, height: 1000 }, pageWidth: 800, pageHeight: 1000 },
    { pageIndex: 1, rect: { x: 0, y: 1020, width: 800, height: 1000 }, pageWidth: 800, pageHeight: 1000 },
  ];
}

describe('zoomPercent', () => {
  it('rounds zoom*100 to an integer percentage', () => {
    expect(zoomPercent({ panX: 0, panY: 0, zoom: 1 })).toBe(100);
    expect(zoomPercent({ panX: 0, panY: 0, zoom: 0.5 })).toBe(50);
    expect(zoomPercent({ panX: 0, panY: 0, zoom: 1.234 })).toBe(123);
    expect(zoomPercent({ panX: 0, panY: 0, zoom: 2.005 })).toBe(201);
  });
});

describe('viewportCenterCanvas', () => {
  it('inverts the camera transform for the viewport centre', () => {
    // screen = (canvas - pan) * zoom  =>  canvas = screen/zoom + pan
    const camera: Camera = { panX: 100, panY: 50, zoom: 2 };
    const center = viewportCenterCanvas(camera, viewport);
    expect(center.x).toBeCloseTo(800 / 2 / 2 + 100); // 200 + 100 = 300
    expect(center.y).toBeCloseTo(600 / 2 / 2 + 50); // 150 + 50 = 200
  });

  it('treats a zero zoom as 1 to stay finite', () => {
    const center = viewportCenterCanvas({ panX: 0, panY: 0, zoom: 0 }, viewport);
    expect(Number.isFinite(center.x)).toBe(true);
    expect(Number.isFinite(center.y)).toBe(true);
  });
});

describe('currentPageIndex', () => {
  it('returns undefined when there are no pages', () => {
    expect(currentPageIndex({ panX: 0, panY: 0, zoom: 1 }, viewport, [])).toBeUndefined();
  });

  it('returns the page whose canvas rect contains the viewport centre', () => {
    // Centre of viewport at zoom 1 with pan y=0 is canvas y=300 -> inside page 0.
    expect(currentPageIndex({ panX: 0, panY: 0, zoom: 1 }, viewport, twoPages())).toBe(0);
    // Pan down so canvas centre lands inside page 1 (y ~ 1320).
    expect(currentPageIndex({ panX: 0, panY: 1020, zoom: 1 }, viewport, twoPages())).toBe(1);
  });

  it('falls back to the nearest page when the centre is in the gap', () => {
    // Put the centre at canvas y ~ 1010 (gap between pages at y 1000..1020):
    // panY chosen so panY + 300 = 1010 -> panY = 710. Nearer to page 0 (dist 10)
    // than page 1 (dist 10) -> ties go to page 0 as the running best.
    const near1 = currentPageIndex({ panX: 0, panY: 715, zoom: 1 }, viewport, twoPages());
    // canvas centre = 300 + 715 = 1015 -> distance to page0 bottom (1000) = 15,
    // to page1 top (1020) = 5 -> page 1 is nearer.
    expect(near1).toBe(1);
  });
});

describe('currentPageNumber', () => {
  it('is the 1-based current page, or undefined with no pages', () => {
    expect(currentPageNumber({ panX: 0, panY: 0, zoom: 1 }, viewport, twoPages())).toBe(1);
    expect(currentPageNumber({ panX: 0, panY: 0, zoom: 1 }, viewport, [])).toBeUndefined();
  });
});
