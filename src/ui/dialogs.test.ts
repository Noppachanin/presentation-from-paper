import { describe, expect, it } from 'vitest';
import { formatBytes } from './dialogs';

/** Unit tests for the oversized-image size formatting shown in the confirm dialog (Req 4.10). */
describe('formatBytes', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(6.5 * 1024 * 1024)).toBe('6.5 MB');
  });
});
