import { defineConfig, devices } from "@playwright/test";

import { backendPort, backendUrl } from "./tests/e2e/test-server";
const frontendPort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1" && !process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    baseURL: `http://127.0.0.1:${frontendPort}`,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `cd ../backend && uv run --locked uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
      url: `${backendUrl}/api/health`,
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: `bunx next dev --hostname 127.0.0.1 --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      env: {
        BACKEND_INTERNAL_URL: backendUrl,
        NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true",
      },
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
