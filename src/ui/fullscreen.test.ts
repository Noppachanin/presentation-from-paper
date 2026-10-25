import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRequestFullscreen, requestFullscreen } from './fullscreen';

/**
 * Unit tests for the feature-detected fullscreen helper (Req 8.9): it prefers
 * the standard API, falls back to the WebKit-prefixed one, reports
 * unavailability, and treats a rejected request as "not entered" so the caller
 * can activate the Fullscreen_Fallback (Req 8.13).
 */

function makeElement(overrides: Partial<Record<string, unknown>>): HTMLElement {
  return overrides as unknown as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canRequestFullscreen', () => {
  it('detects the standard API', () => {
    expect(canRequestFullscreen(makeElement({ requestFullscreen: () => {} }))).toBe(true);
  });

  it('detects the WebKit-prefixed API', () => {
    expect(canRequestFullscreen(makeElement({ webkitRequestFullscreen: () => {} }))).toBe(true);
  });

  it('reports false when neither API exists', () => {
    expect(canRequestFullscreen(makeElement({}))).toBe(false);
  });

  it('reports false for a null element', () => {
    expect(canRequestFullscreen(null)).toBe(false);
  });
});

describe('requestFullscreen', () => {
  it('prefers the standard API when both are present', async () => {
    const std = vi.fn().mockResolvedValue(undefined);
    const webkit = vi.fn().mockResolvedValue(undefined);
    const el = makeElement({ requestFullscreen: std, webkitRequestFullscreen: webkit });

    await expect(requestFullscreen(el)).resolves.toBe(true);
    expect(std).toHaveBeenCalledOnce();
    expect(webkit).not.toHaveBeenCalled();
  });

  it('falls back to the WebKit API when standard is absent', async () => {
    const webkit = vi.fn().mockResolvedValue(undefined);
    const el = makeElement({ webkitRequestFullscreen: webkit });

    await expect(requestFullscreen(el)).resolves.toBe(true);
    expect(webkit).toHaveBeenCalledOnce();
  });

  it('resolves false when no API exists', async () => {
    await expect(requestFullscreen(makeElement({}))).resolves.toBe(false);
  });

  it('resolves false when the request is rejected (fallback path, Req 8.13)', async () => {
    const std = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(requestFullscreen(makeElement({ requestFullscreen: std }))).resolves.toBe(false);
  });

  it('resolves false for a null element', async () => {
    await expect(requestFullscreen(null)).resolves.toBe(false);
  });
});
