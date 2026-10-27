import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

type Saved = {
  design: {
    size: string;
    background: string;
    layers: Array<{
      x: number;
      y: number;
      width: number;
      rotation: number;
      type: string;
    }>;
  };
  tableScene: unknown;
};

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]));

async function saveAndRead(page: Page): Promise<Saved> {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByText("Проект сохранён в этом браузере.", { exact: false }),
  ).toBeVisible();
  return page.evaluate(
    async () =>
      new Promise<Saved>((resolve, reject) => {
        const request = indexedDB.open("strogo-custom-local", 1);
        request.onerror = reject;
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("projects")
            .objectStore("projects")
            .get("draft");
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = reject;
        };
      }),
  );
}

async function fixture(page: Page, type = "image/png") {
  const data = await page.evaluate((type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#d32f48";
    context.fillRect(0, 0, 180, 160);
    context.fillStyle = "#216a9b";
    context.fillRect(180, 0, 180, 80);
    return canvas.toDataURL(type).split(",")[1]!;
  }, type);
  return {
    name: `qa-image.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`,
    mimeType: type,
    buffer: Buffer.from(data, "base64"),
  };
}

async function placeUpload(page: Page, type = "image/png") {
  await page
    .locator("input[type=file]")
    .setInputFiles(await fixture(page, type));
  await expect(
    page.getByRole("dialog", { name: "Предпросмотр загруженного изображения" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Разместить на коврике" }).click();
  await expect(page.locator(".editor-selection")).toBeVisible();
}

async function waitForHeroImage(page: Page) {
  await expect
    .poll(() =>
      page
        .locator(".pl-hero-mat.is-main img")
        .evaluate(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

async function scrollHero(page: Page, progress: number) {
  await page.locator(".pl-scroll-hero").evaluate((hero, value) => {
    const sticky = hero.firstElementChild as HTMLElement;
    const top = hero.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + (hero.clientHeight - sticky.clientHeight) * value);
  }, progress);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function captureDark(page: Page, name: string) {
  await page.screenshot({
    path: `docs/screenshots/dark-${name}.png`,
    fullPage: false,
  });
}

test("premium landing scroll story, examples, FAQ, anchor navigation and responsive views", async ({
  page,
}) => {
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/custom");
    await waitForHeroImage(page);
    await expect(page.locator(".pl-scroll-hero")).toHaveAttribute(
      "data-animation-engine",
      "view-timeline",
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Твоя игра.",
    );
    await expect(page.locator(".pl-hero-title-block")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.locator(".pl-hero-closeup")).toHaveCSS("opacity", "1");
    const initial = await page.locator(".pl-hero-mat.is-main").boundingBox();
    if (!initial) throw new Error("Main hero mat missing");
    expect(initial.width).toBeGreaterThanOrEqual(width);
    expect(initial.height).toBeGreaterThanOrEqual(1000);
    await captureDark(page, `landing-${width}-top`);
    await scrollHero(page, 0.05);
    const opacity = Number(
      await page
        .locator(".pl-hero-title-block")
        .evaluate((el) => getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.9);
    await captureDark(page, `landing-${width}-textfade`);
    await scrollHero(page, 0.15);
    await expect(page.locator(".pl-hero-title-block")).toHaveCSS(
      "opacity",
      "0",
    );
    await scrollHero(page, 0.5);
    await captureDark(page, `landing-${width}-mid`);
    await scrollHero(page, 0.85);
    await expect(page.locator(".pl-hero-closeup")).toHaveCSS("opacity", "0");
    await expect(page.locator(".pl-hero-title-block")).toHaveCSS(
      "opacity",
      "0",
    );
    const shrunken = await page.locator(".pl-hero-mat.is-main").boundingBox();
    if (!shrunken) throw new Error("Main hero mat missing at gallery");
    expect(shrunken.width).toBeLessThan(initial.width * 0.4);
    expect(shrunken.height).toBeLessThan(initial.height * 0.4);
    const visibleMats = await page.locator(".pl-hero-mat").evaluateAll(
      (mats) =>
        mats.filter((mat) => {
          const r = mat.getBoundingClientRect();
          return (
            r.right > 0 &&
            r.left < innerWidth &&
            r.bottom > 0 &&
            r.top < innerHeight
          );
        }).length,
    );
    expect(visibleMats).toBeGreaterThan(3);
    await expect(page.locator(".pl-header")).toHaveCSS("position", "fixed");
    expect((await page.locator(".pl-header").boundingBox())!.y).toBeLessThan(
      20,
    );
    expect(
      Math.abs(shrunken.x + shrunken.width / 2 - width / 2),
      "main mat stays horizontally centered",
    ).toBeLessThan(1.5);
    expect(
      Math.abs(shrunken.y + shrunken.height / 2 - 500),
      "main mat stays vertically centered",
    ).toBeLessThan(1.5);
    await captureDark(page, `landing-${width}-end`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await scrollHero(page, 0);
    await expect(page.locator(".pl-hero-title-block")).toHaveCSS(
      "opacity",
      "1",
    );
    expect(
      (await page.locator(".pl-hero-mat.is-main").boundingBox())!.width,
    ).toBeCloseTo(initial.width, 0);
    if (width <= 390) {
      await page.getByRole("button", { name: "Открыть меню" }).click();
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Открыть меню" }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Открыть меню" }).click();
    }
    await page.getByRole("link", { name: "Возможности", exact: true }).click();
    const headerBottom =
      (await page.locator(".pl-nav-shell").boundingBox())!.y +
      (await page.locator(".pl-nav-shell").boundingBox())!.height;
    expect(
      (await page.locator("#pl-possibilities-title").boundingBox())!.y,
    ).toBeGreaterThan(headerBottom);
    await expect(
      page.getByRole("group", { name: "Рассмотреть возможности коврика" }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Можно ли загрузить любую картинку?" })
      .click();
    await expect(page.locator("details[open]")).toContainText("PNG");
    if (width === 1440) {
      await page.locator(".pl-possibilities").screenshot({
        path: "docs/screenshots/dark-content-1440.png",
        animations: "disabled",
        style: ".pl-header, .pl-skip { visibility: hidden !important; }",
      });
    }
    await page.screenshot({
      path: `docs/screenshots/dark-sections-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.locator('.pl-header a[href="/custom/create"]').click();
    await expect(page).toHaveURL(/\/custom\/create$/);
    await expect(
      page.getByRole("heading", { name: "Твоя территория." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Применить принт Рельеф" }).click();
    expect(
      await page.locator(".editor-rug").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width / r.height;
      }),
    ).toBeCloseTo(2.25, 2);
  }
});

test("premium landing reduced motion is a static readable gallery", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/custom");
    await waitForHeroImage(page);
    await expect(page.locator(".pl-hero-sticky")).toHaveCSS(
      "position",
      "relative",
    );
    await expect(page.locator(".pl-hero-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".pl-hero-copy")).toHaveCSS(
      "position",
      "relative",
    );
    await expect(page.locator(".pl-hero-shade")).toHaveCSS("display", "none");
    const transform = await page
      .locator(".pl-mosaic")
      .evaluate((el) => getComputedStyle(el).transform);
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(page.locator(".pl-hero-copy")).toHaveCSS("opacity", "1");
    expect(
      await page
        .locator(".pl-mosaic")
        .evaluate((el) => getComputedStyle(el).transform),
    ).toBe(transform);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureDark(page, `reduced-motion-${width}`);
  }
});

test("hero RAF fallback preserves geometry, text tracks and live reduced-motion preference", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "ViewTimeline", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/custom");
  await waitForHeroImage(page);
  await expect(page.locator(".pl-scroll-hero")).toHaveAttribute(
    "data-animation-engine",
    "raf",
  );
  const initial = await page.locator(".pl-hero-mat.is-main").boundingBox();
  await scrollHero(page, 0.85);
  await expect(page.locator(".pl-hero-title-block")).toHaveCSS("opacity", "0");
  const end = await page.locator(".pl-hero-mat.is-main").boundingBox();
  expect(end!.width).toBeLessThan(initial!.width * 0.4);
  expect(Math.abs(end!.x + end!.width / 2 - 720)).toBeLessThan(1.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pl-scroll-hero")).toHaveAttribute(
    "data-animation-engine",
    "static",
  );
  await expect(page.locator(".pl-hero-closeup")).toHaveCSS("display", "none");
  await expect(page.locator(".pl-hero-title-block")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pl-scroll-hero")).toHaveAttribute(
    "data-animation-engine",
    "raf",
  );
  await scrollHero(page, 0);
  await expect(page.locator(".pl-hero-title-block")).toHaveCSS("opacity", "1");
  expect(
    (await page.locator(".pl-hero-mat.is-main").boundingBox())!.width,
  ).toBeCloseTo(initial!.width, 0);
});

test("dark product explorer colors, sizes, artwork, text, scene and accessible dismissal", async ({
  page,
}) => {
  await mkdir("docs/screenshots", { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/custom");
    const trigger = page
      .getByRole("group", { name: "Рассмотреть возможности коврика" })
      .getByRole("button", { name: "Цвета", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Твой коврик. В деталях.",
    });
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await dialog
      .getByRole("group", { name: "Цвет фона коврика" })
      .getByRole("button", { name: "Мел", exact: true })
      .click();
    await expect(dialog.locator(".pe-product-stage")).toHaveAttribute(
      "aria-label",
      /Мел/,
    );
    await expect(
      dialog.locator(".pe-rug-active .pe-color-layer.pe-layer-active"),
    ).toHaveCSS("background-color", "rgb(213, 210, 200)");
    await dialog
      .locator(".pe-artwork-image")
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      );
    await page.screenshot({
      path: `docs/screenshots/dark-explorer-${width}-colors.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Два размера", exact: true })
      .click();
    if (width > 760) {
      const morphingEntries = await dialog
        .locator("[data-feature-index]")
        .evaluateAll(
          (entries) =>
            entries.filter((entry) =>
              entry
                .getAnimations()
                .some(
                  (animation) =>
                    animation.effect instanceof KeyframeEffect &&
                    animation.effect
                      .getKeyframes()
                      .some((frame) => "height" in frame && "width" in frame),
                ),
            ).length,
        );
      expect(morphingEntries).toBe(2);
    }
    for (const [name, ratio] of [
      ["49 × 42 см", 490 / 420],
      ["90 × 40 см", 2.25],
    ] as const) {
      await dialog
        .getByRole("group", { name: "Размер коврика", exact: true })
        .getByRole("button", { name, exact: true })
        .click();
      expect(
        await dialog.locator(".pe-rug-active").evaluate((el) => {
          const style = getComputedStyle(el);
          return parseFloat(style.width) / parseFloat(style.height);
        }),
      ).toBeCloseTo(ratio, 2);
    }
    await page.screenshot({
      path: `docs/screenshots/dark-explorer-${width}-sizes.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Свой дизайн", exact: true })
      .click();
    await dialog
      .getByRole("group", { name: "Пример дизайна", exact: true })
      .getByRole("button", { name: "Orbit", exact: true })
      .click();
    await expect(
      dialog.locator(".pe-rug-active .pe-artwork-image.pe-layer-active"),
    ).toHaveAttribute("src", "/assets/orbit.svg");
    await dialog.getByRole("button", { name: "Надпись", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "Твоя надпись", exact: true })
      .fill("МОЯ ИГРА");
    await dialog
      .getByRole("group", { name: "Цвет надписи" })
      .getByRole("button", { name: "Тёмная", exact: true })
      .click();
    await expect(dialog.locator(".pe-rug-active .pe-custom-text")).toHaveText(
      "МОЯ ИГРА",
    );
    await expect(dialog.locator(".pe-rug-active .pe-custom-text")).toHaveCSS(
      "color",
      "rgb(23, 23, 25)",
    );
    await dialog
      .getByRole("button", { name: "На твоём столе", exact: true })
      .click();
    await dialog
      .getByRole("checkbox", { name: "Показать клавиатуру и мышь" })
      .uncheck();
    await expect(dialog.locator(".pe-desk-props")).toHaveCSS("opacity", "0");
    await dialog
      .getByRole("checkbox", { name: "Показать клавиатуру и мышь" })
      .check();
    await expect(dialog.locator(".pe-desk-props")).toHaveCSS("opacity", "1");
    await dialog
      .getByRole("button", { name: "Следующая возможность", exact: true })
      .click();
    await expect(
      dialog.getByRole("group", { name: "Цвет фона коврика" }),
    ).toBeVisible();
    if (width > 760) {
      for (const feature of [
        "Свой дизайн",
        "Надпись",
        "Два размера",
        "Цвета",
      ]) {
        await dialog
          .getByRole("button", { name: feature, exact: true })
          .click({ force: true });
      }
      await expect
        .poll(() =>
          dialog
            .locator("[data-feature-index]")
            .evaluateAll((entries) =>
              entries.every(
                (entry) =>
                  !(entry as HTMLElement).style.overflow &&
                  !(entry as HTMLElement).style.getPropertyValue(
                    "--pe-morph-card-width",
                  ),
              ),
            ),
        )
        .toBe(true);
    }
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await trigger.click();
    await dialog
      .getByRole("button", { name: "Закрыть обзор коврика", exact: true })
      .click();
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("group", { name: "Рассмотреть возможности коврика" })
    .getByRole("button", { name: "Два размера", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Твой коврик. В деталях." });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("group", { name: "Размер коврика", exact: true })
    .getByRole("button", { name: "49 × 42 см", exact: true })
    .click();
  await expect(dialog.locator(".pe-rug-active")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.keyboard.press("Escape");
});

test("uploaded artwork transforms, source sampling, scene independence, restore, export and demo cart", async ({
  page,
}) => {
  await page.goto("/custom/create");
  await placeUpload(page);
  await page.getByRole("spinbutton", { name: "По X", exact: true }).fill("410");
  await page.getByRole("spinbutton", { name: "По Y", exact: true }).fill("180");
  await page
    .getByRole("spinbutton", { name: "Поворот", exact: true })
    .fill("25");
  const rug = page.locator(".editor-rug");
  const box = await rug.boundingBox();
  if (!box) throw new Error("Missing rug");
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.46, {
    steps: 5,
  });
  await page.mouse.up();
  const beforeSize = await saveAndRead(page);
  await page.getByRole("button", { name: /49 × 42 см/ }).click();
  await expect(
    page.getByText("Часть дизайна выходит за коврик", { exact: false }),
  ).toBeVisible();
  const compact = await saveAndRead(page);
  expect(compact.design.layers).toEqual(beforeSize.design.layers);
  expect(compact.design.size).toBe("compact");
  await page.getByRole("button", { name: /90 × 40 см/ }).click();
  await page.getByRole("button", { name: "Вписать / сбросить" }).click();
  await page.getByRole("tab", { name: "Фон", exact: true }).click();
  await page.getByRole("textbox", { name: "HEX цвета фона" }).fill("#ffffff");
  await page
    .getByRole("button", { name: "Взять цвет с изображения", exact: false })
    .click();
  await rug.click({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
  await expect(
    page.getByRole("textbox", { name: "HEX цвета фона" }),
  ).toHaveValue("#d32f48");
  await page.getByRole("tab", { name: "Текст", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить надпись", exact: false })
    .click();
  await page.locator("textarea").fill("МОЯ ИГРА");
  const designBeforeScene = await saveAndRead(page);
  await page.getByRole("button", { name: "На столе", exact: false }).click();
  const sceneRug = page.locator(".editor-scene-rug");
  await sceneRug.scrollIntoViewIfNeeded();
  const sceneBox = await sceneRug.boundingBox();
  if (!sceneBox) throw new Error("Missing scene rug");
  await page.mouse.move(
    sceneBox.x + sceneBox.width * 0.15,
    sceneBox.y + sceneBox.height * 0.75,
  );
  await page.mouse.down();
  await page.mouse.move(
    sceneBox.x + sceneBox.width * 0.15 + 40,
    sceneBox.y + sceneBox.height * 0.75 + 15,
    { steps: 5 },
  );
  await page.mouse.up();
  const draggedScene = await saveAndRead(page);
  expect(draggedScene.design).toEqual(designBeforeScene.design);
  expect(draggedScene.tableScene).not.toEqual(designBeforeScene.tableScene);
  await page.screenshot({
    path: "docs/screenshots/editor-scene-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("spinbutton", { name: "Смещение X", exact: true })
    .fill("75");
  await page
    .getByRole("combobox", { name: "Предмет в сцене" })
    .selectOption("keyboard");
  await page
    .getByRole("spinbutton", { name: "Смещение Y", exact: true })
    .fill("80");
  const designAfterScene = await saveAndRead(page);
  expect(designAfterScene.design).toEqual(designBeforeScene.design);
  expect(designAfterScene.tableScene).not.toEqual(designBeforeScene.tableScene);
  await page
    .getByRole("button", { name: "Редактирование", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  expect((await saveAndRead(page)).design).toEqual(designAfterScene.design);
  await page
    .getByRole("button", { name: "Начать заново", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Оставить дизайн", exact: true })
    .click();
  expect((await saveAndRead(page)).design).toEqual(designAfterScene.design);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG ↓", exact: true }).click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!);
  expect(exported.subarray(1, 4).toString()).toBe("PNG");
  expect(exported.readUInt32BE(16)).toBe(2400);
  expect(exported.readUInt32BE(20)).toBe(1067);
  await page.getByRole("button", { name: "Продолжить", exact: false }).click();
  await expect(
    page.getByRole("dialog", { name: "Демонстрационная корзина" }),
  ).toContainText("оплата не принимается");
  await page
    .getByRole("button", { name: "Добавить в демо-корзину", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Добавлено ✓", exact: true }),
  ).toBeDisabled();
  const cart = await page.evaluate(
    () =>
      new Promise<{ mode: string; price: null }[]>((resolve, reject) => {
        const req = indexedDB.open("strogo-custom-demo-cart", 1);
        req.onerror = reject;
        req.onsuccess = () => {
          const db = req.result;
          const r = db.transaction("items").objectStore("items").getAll();
          r.onsuccess = () => {
            db.close();
            resolve(r.result);
          };
        };
      }),
  );
  expect(cart).toHaveLength(1);
  expect(cart[0]!.mode).toBe("demo");
  expect(cart[0]!.price).toBeNull();
  await page
    .getByRole("button", { name: "К редактированию", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Начать заново", exact: true })
    .click();
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await expect(
    page.getByText("Здесь будет твой дизайн", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Отменить действие", exact: true })
    .click();
  expect((await saveAndRead(page)).design).toEqual(designAfterScene.design);
});

test("touch drag, resize/rotation handles, tab keyboard and reset without storage", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:5173/custom/create");
    await page.getByRole("button", { name: "Применить принт Рельеф" }).click();
    await page.locator(".editor-rug").scrollIntoViewIfNeeded();
    const before = await page
      .getByRole("spinbutton", { name: "По X", exact: true })
      .inputValue();
    const rug = await page.locator(".editor-rug").boundingBox();
    if (!rug) throw new Error("Missing mobile rug");
    const cdp = await context.newCDPSession(page);
    const x = rug.x + rug.width * 0.5;
    const y = rug.y + rug.height * 0.5;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 30, y: y + 10 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByRole("spinbutton", { name: "По X", exact: true }),
    ).not.toHaveValue(before);
    await page.getByRole("button", { name: "Вписать / сбросить" }).click();
    const widthBefore = await page
      .getByRole("slider", { name: "Масштаб элемента" })
      .inputValue();
    const handle = page.locator(".editor-scale-br");
    await handle.scrollIntoViewIfNeeded();
    const h = await handle.boundingBox();
    if (!h) throw new Error("Missing resize handle");
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 - 20, h.y + h.height / 2 - 10, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(
      page.getByRole("slider", { name: "Масштаб элемента" }),
    ).not.toHaveValue(widthBefore);
    const rotate = page.locator(".editor-rotate-handle");
    await rotate.scrollIntoViewIfNeeded();
    const r = await rotate.boundingBox();
    if (!r) throw new Error("Missing rotate handle");
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 25, r.y + r.height / 2 + 15, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(
      page.getByRole("spinbutton", { name: "Поворот", exact: true }),
    ).not.toHaveValue("0");
    await page.getByRole("tab", { name: "Изображение", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Текст", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() =>
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: undefined,
      }),
    );
    await page
      .getByRole("button", { name: "Начать заново", exact: true })
      .click();
    await page.getByRole("button", { name: "Сбросить", exact: true }).click();
    await expect(
      page.getByText("Здесь будет твой дизайн", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: "Отменить действие", exact: true })
      .click();
    await expect(page.locator(".editor-layer-list button")).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("raster formats, bad upload errors and actual source alpha sampling", async ({
  page,
}) => {
  await page.goto("/custom/create");
  const droppedFile = await fixture(page);
  await page.locator(".editor-upload").evaluate(
    (target, image) => {
      const bytes = Uint8Array.from(atob(image.data), (char) =>
        char.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "dropped.png", { type: "image/png" }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    },
    { data: droppedFile.buffer.toString("base64") },
  );
  await expect(
    page.getByRole("dialog", { name: "Предпросмотр загруженного изображения" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Разместить на коврике" }).click();
  await saveAndRead(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Восстановить", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Применить принт Орбита" }).click();
  await saveAndRead(page);
  await expect(
    page.getByRole("button", { name: "Восстановить", exact: true }),
  ).toHaveCount(0);
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    await placeUpload(page, type);
    await expect(page.locator(".editor-quality")).toContainText(
      "Низкое разрешение",
    );
  }
  await page.locator("input[type=file]").setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("20");
  const pixelResult = await page.evaluate(async () => {
    const modulePath = "/src/editor/render.ts";
    const domainPath = "/src/editor/domain.ts";
    const { sampleSourcePixel, exportDesign } = await import(modulePath);
    const { createProject, createImageLayer } = await import(domainPath);
    const c = document.createElement("canvas");
    c.width = 10;
    c.height = 10;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#216a9b";
    ctx.fillRect(0, 0, 5, 10);
    const project = createProject();
    const layer = createImageLayer(
      {
        src: c.toDataURL(),
        name: "alpha.png",
        naturalWidth: 10,
        naturalHeight: 10,
      },
      project.design,
    );
    layer.x = 450;
    layer.y = 200;
    layer.width = 200;
    layer.rotation = 90;
    const opaque = await sampleSourcePixel(
      layer,
      { x: 450, y: 150 },
      "#ffffff",
    );
    let transparent = "";
    try {
      await sampleSourcePixel(layer, { x: 450, y: 250 }, "#ffffff");
    } catch (error) {
      transparent = (error as Error).message;
    }
    project.design.layers = [layer];
    project.design.background = "#ffffff";
    const blob = await exportDesign(project.design);
    const image = await createImageBitmap(blob);
    const out = document.createElement("canvas");
    out.width = image.width;
    out.height = image.height;
    const outCtx = out.getContext("2d")!;
    outCtx.drawImage(image, 0, 0);
    const corner = Array.from(outCtx.getImageData(0, 0, 1, 1).data);
    const background = Array.from(outCtx.getImageData(100, 100, 1, 1).data);
    image.close();
    return { opaque, transparent, corner, background };
  });
  expect(pixelResult.opaque).toBe("#216a9b");
  expect(pixelResult.transparent).toContain("прозрачный");
  expect(pixelResult.corner[3]).toBe(0);
  expect(pixelResult.background).toEqual([255, 255, 255, 255]);
});
