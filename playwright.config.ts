import { defineConfig, devices } from '@playwright/test';

// Playwright configuration for the end-to-end layer (Req 12.6). WebKit is the
// only project because the feature targets Safari/iPadOS pointer and gesture
// behavior; running the suite against the WebKit engine exercises the
// Safari-specific pointer/gesture paths.
//
// No e2e specs are written yet (added by later tasks 15.2 and 18.1). The
// testDir and webServer are configured now so those tasks can drop spec files
// into `e2e/` and run against the Vite preview build without further config.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  // The preview server hosts the production build for the e2e suite. It is only
  // started when Playwright actually runs tests; later e2e tasks rely on it.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
