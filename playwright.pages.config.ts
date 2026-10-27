import { defineConfig } from "@playwright/test";

process.env.PAGES_BASE_URL ||= "http://127.0.0.1:4174/strogo.custom/";
const site = new URL(process.env.PAGES_BASE_URL);
const local = site.hostname === "127.0.0.1";
export default defineConfig({
  testDir: "./tests",
  testMatch: "pages.spec.ts",
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: site.href,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHROME_EXECUTABLE ? undefined : "chrome",
    launchOptions: process.env.PLAYWRIGHT_CHROME_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE }
      : undefined,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: local
    ? {
        command: "node tests/serve-pages.mjs",
        url: site.href,
        reuseExistingServer: true,
        timeout: 20_000,
      }
    : undefined,
});
