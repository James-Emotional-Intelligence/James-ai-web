import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  webServer: {
    command: 'npx tsx server.ts',
    url: 'http://localhost:3000/api/v1/health/live',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      APP_MODE: 'demo',
      DEMO_LOGIN_ENABLED: 'true',
      NODE_ENV: 'development',
      PORT: '3000',
      COOKIE_SECURE: 'false',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
