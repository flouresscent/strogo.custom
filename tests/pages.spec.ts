import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test.skip(
  !process.env.PAGES_BASE_URL,
  "Run with playwright.pages.config.ts against a strict static Pages build.",
);
const site = new URL(
  process.env.PAGES_BASE_URL || "http://127.0.0.1:4174/strogo.custom/",
);
const route = (path = "") => new URL(path, site).href;
const issues = new WeakMap<
  Page,
  {
    errors: string[];
    badRequests: string[];
    failedResponses: string[];
    assets: string[];
  }
>();
test.beforeEach(({ page }) => {
  const state = {
    errors: [] as string[],
    badRequests: [] as string[],
    failedResponses: [] as string[],
    assets: [] as string[],
  };
  issues.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === site.origin &&
      (url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/custom"))
    )
      state.badRequests.push(url.pathname);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== site.origin) return;
    if (response.status() >= 400)
      state.failedResponses.push(`${response.status()} ${url.pathname}`);
    if (
      response.status() === 200 &&
      /\.(?:js|css|woff2?|svg|png|webp)(?:\?|$)/.test(url.pathname)
    )
      state.assets.push(url.pathname);
  });
});
test.afterEach(({ page }) => {
  const state = issues.get(page)!;
  expect(state.errors).toEqual([]);
  expect(state.badRequests).toEqual([]);
  expect(state.failedResponses).toEqual([]);
});

async function saveAndRead(page: Page) {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByText("Проект сохранён в этом браузере.", { exact: false }),
  ).toBeVisible();
  return page.evaluate(
    () =>
      new Promise<{
        design: {
          layers: Array<{ src?: string }>;
          background: string;
          showLogo: boolean;
        };
      }>((resolve, reject) => {
        const request = indexedDB.open("strogo-custom-local", 1);
        request.onerror = reject;
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("projects")
            .objectStore("projects")
            .get("draft");
          read.onerror = reject;
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      }),
  );
}

async function downloadPixels(page: Page) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG ↓", exact: true }).click();
  const file = await waiting;
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(2400);
  expect(bytes.readUInt32BE(20)).toBe(1067);
  return page.evaluate(async (data) => {
    const binary = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([binary], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const sample = (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data);
    const colors = new Set<string>();
    for (let y = 100; y < canvas.height; y += 80)
      for (let x = 100; x < canvas.width; x += 100)
        colors.add(sample(x, y).join(","));
    return {
      left: sample(600, 533),
      right: sample(1800, 533),
      colors: colors.size,
    };
  }, bytes.toString("base64"));
}

test("Pages build resolves prefixed routes and local assets without SPA fallback", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["", "Твоя игра."],
    ["custom", "Твоя игра."],
    ["custom/", "Твоя игра."],
    ["custom/create", "Твоя территория."],
    ["custom/create/", "Твоя территория."],
  ]) {
    const response = await page.goto(route(path));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading!,
    );
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading!,
    );
  }
  await page.goto(route());
  await expect
    .poll(() =>
      page
        .locator(".pl-hero-mat.is-main img")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.load("12px TildaSans"));
  await page
    .getByRole("group", { name: "Рассмотреть возможности коврика" })
    .getByRole("button", { name: "Свой дизайн", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Твой коврик. В деталях." });
  await dialog
    .locator(".pe-artwork-image")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    );
  for (const name of ["Contour", "Orbit", "Mono", "Пейзаж"]) {
    await dialog
      .getByRole("group", { name: "Пример дизайна", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
    expect(
      await dialog
        .locator(".pe-rug-active img.pe-layer-active")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }
  await page.keyboard.press("Escape");
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/pages-landing.png" });
  const link = page.locator('.pl-header a[href$="/custom/create"]');
  await expect(link).toHaveAttribute("href", site.pathname + "custom/create");
  await link.click();
  await expect(page).toHaveURL(/\/strogo\.custom\/custom\/create\/?$/);
  await expect(
    page.getByRole("heading", { name: "Твоя территория." }),
  ).toBeVisible();
  const assets = issues.get(page)!.assets;
  expect(assets.some((path) => path.endsWith(".js"))).toBe(true);
  expect(assets.some((path) => path.endsWith(".css"))).toBe(true);
  expect(assets.some((path) => path.endsWith(".woff2"))).toBe(true);
  if (site.hostname === "127.0.0.1") {
    expect(
      (
        await page.request.get(new URL("/assets/contour.svg", site).href)
      ).status(),
    ).toBe(404);
    expect((await page.request.get(route("missing-route"))).status()).toBe(404);
  }
});

test("Pages editor loads built-in artwork and logo, exports nonblank PNG and restores canonical sources", async ({
  page,
}) => {
  await page.goto(route("custom/create/"));
  for (const name of ["Орбита", "Моно", "Рельеф"])
    await page
      .getByRole("button", { name: `Применить принт ${name}`, exact: true })
      .click();
  await expect
    .poll(() =>
      page
        .locator(".editor-rug canvas")
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(300);
  await page.getByRole("checkbox", { name: /Логотип Strogo/ }).check();
  await page.getByRole("tab", { name: "Фон", exact: true }).click();
  await page.getByRole("textbox", { name: "HEX цвета фона" }).fill("#ff00ff");
  await page
    .getByRole("button", { name: "Взять цвет с изображения", exact: false })
    .click();
  await page.locator(".editor-rug").click({ position: { x: 200, y: 100 } });
  await expect(
    page.getByRole("textbox", { name: "HEX цвета фона" }),
  ).not.toHaveValue("#ff00ff");
  const project = await saveAndRead(page);
  expect(project.design.layers[0]!.src).toBe("/assets/contour.svg");
  expect(project.design.showLogo).toBe(true);
  expect((await downloadPixels(page)).colors).toBeGreaterThan(3);
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  const restored = await saveAndRead(page);
  expect(restored.design).toEqual(project.design);
  expect((await downloadPixels(page)).colors).toBeGreaterThan(3);
  expect(
    issues
      .get(page)!
      .assets.some((path) => path === site.pathname + "assets/strogo-logo.png"),
  ).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "docs/screenshots/pages-editor.png" });
});

test("Pages editor keeps local transparent PNG pixels, eyedropper and save/restore intact", async ({
  page,
}) => {
  await page.goto(route("custom/create/"));
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#147f9d";
    ctx.fillRect(0, 0, 40, 40);
    return canvas.toDataURL().split(",")[1]!;
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "local-alpha.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("button", { name: "Разместить на коврике", exact: false })
    .click();
  await page.getByRole("tab", { name: "Фон", exact: true }).click();
  await page.getByRole("textbox", { name: "HEX цвета фона" }).fill("#ffffff");
  await page
    .getByRole("button", { name: "Взять цвет с изображения", exact: false })
    .click();
  const rug = page.locator(".editor-rug");
  const box = await rug.boundingBox();
  if (!box) throw new Error("Missing rug");
  await rug.click({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
  await expect(
    page.getByRole("textbox", { name: "HEX цвета фона" }),
  ).toHaveValue("#147f9d");
  await page
    .getByRole("button", { name: "Взять цвет с изображения", exact: false })
    .click();
  await rug.click({ position: { x: box.width * 0.75, y: box.height * 0.5 } });
  await expect(page.getByRole("alert")).toContainText("прозрачный");
  await page.getByRole("textbox", { name: "HEX цвета фона" }).fill("#ffffff");
  const saved = await saveAndRead(page);
  expect(
    saved.design.layers[0]!.src?.startsWith("data:image/png;base64,"),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  expect((await saveAndRead(page)).design).toEqual(saved.design);
  const pixels = await downloadPixels(page);
  expect(pixels.left).toEqual([20, 127, 157, 255]);
  expect(pixels.right).toEqual([255, 255, 255, 255]);
});
