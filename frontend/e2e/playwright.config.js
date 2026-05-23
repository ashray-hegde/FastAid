const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'off'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
};
