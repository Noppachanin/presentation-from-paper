import { describe, expect, it } from 'vitest';

// Trivial sanity test that proves the Vitest configuration (jsdom environment,
// globals, include glob under src/) loads and runs a test once without watch
// mode. Replaced/augmented by the real unit and property-based tests in later
// tasks.
describe('vitest configuration', () => {
  it('runs a passing test in the jsdom environment', () => {
    expect(1 + 1).toBe(2);
    // Confirms the jsdom environment is active (document is defined).
    expect(typeof document).toBe('object');
  });
});
