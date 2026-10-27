import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  ignoreHTTPSErrors: true,
});
try {
  for (const [name, url] of [
    ["home", "https://strogo.shop/"],
    ["darkness", "https://strogo.shop/darkness"],
  ]) {
    await page.goto(url!, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `docs/screenshots/reference-${name}.png`,
      fullPage: false,
    });
  }
} finally {
  await browser.close();
}
