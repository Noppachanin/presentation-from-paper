// Global setup for the Vitest unit/integration layer.
//
// Currently a placeholder; shared DOM polyfills or matchers (for example
// Pointer_Event helpers for the Input_Router tests) can be registered here as
// later tasks need them. Keeping the file referenced from vitest.config.ts now
// avoids a config change when the first shared setup is introduced.
export {};
