import { defineConfig, devices } from "@playwright/test";

const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1" && !process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:3100",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cd ../backend && uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8100",
      url: "http://127.0.0.1:8100/api/health",
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: "bunx next dev --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      env: { BACKEND_INTERNAL_URL: "http://127.0.0.1:8100" },
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
