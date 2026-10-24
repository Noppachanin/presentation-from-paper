/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest configuration for the unit, property-based (fast-check), and PDF
// integration test layer (Req 12.6). The suite runs once without watch mode by
// default: `vitest` resolves to `vitest run` in a non-interactive/CI context,
// and the `test:ci` npm script passes `--run` explicitly so the command never
// enters watch mode.
//
// A jsdom environment is used so DOM-dependent units (Input_Router with
// synthetic Pointer_Events, render helpers) can execute without a browser. The
// end-to-end WebKit layer is handled separately by Playwright.
export default defineConfig({
  plugins: [react()],
  test: {
    // Watch mode is disabled by default; `test:ci` also passes `--run`.
    watch: false,
    environment: 'jsdom',
    globals: true,
    // Unit, property, and PDF integration tests live next to source files or
    // under src/; the Playwright e2e suite in `e2e/` is excluded here.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
