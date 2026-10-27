import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after")
  throw new Error("Choose before or after");
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  // tsx preserves function names using a helper; browser-evaluated functions need its no-op equivalent.
  await page.addInitScript("window.__name = (fn) => fn");
  await page.goto("http://127.0.0.1:5173/custom", { waitUntil: "networkidle" });
  await page.locator(".pl-hero-mat.is-main img").waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".pl-scroll-hero img")).every(
      (image) =>
        (image as HTMLImageElement).complete &&
        (image as HTMLImageElement).naturalWidth > 0,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  const source = await readFile("src/landing/ScrollHero.tsx");
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const metric = async () =>
    Object.fromEntries(
      (await client.send("Performance.getMetrics")).metrics.map(
        ({ name, value }) => [name, value],
      ),
    );
  const before = await metric();
  await client.send("Tracing.start", {
    categories: "devtools.timeline,blink.user_timing",
    transferMode: "ReturnAsStream",
  });
  const samples = await page.evaluate(async () => {
    const hero = document.querySelector<HTMLElement>(".pl-scroll-hero")!;
    const sticky = hero.firstElementChild as HTMLElement;
    const target = hero.offsetTop + hero.clientHeight - sticky.clientHeight;
    const intervals: number[] = [];
    const callbackDurations: number[] = [];
    const start = performance.now();
    let previous = start;
    return new Promise<{
      intervals: number[];
      callbackDurations: number[];
      elapsedMs: number;
      scrollPx: number;
    }>((resolve) => {
      const tick = (now: number) => {
        const taskStart = performance.now();
        intervals.push(now - previous);
        previous = now;
        const progress = Math.min(1, (now - start) / 3000);
        window.scrollTo(0, target * progress);
        callbackDurations.push(performance.now() - taskStart);
        if (progress < 1) requestAnimationFrame(tick);
        else
          requestAnimationFrame(() =>
            resolve({
              intervals: intervals.slice(1),
              callbackDurations,
              elapsedMs: performance.now() - start,
              scrollPx: target,
            }),
          );
      };
      requestAnimationFrame(tick);
    });
  });
  const traceReady = new Promise<string>((resolve) =>
    client.once("Tracing.tracingComplete", (event) => resolve(event.stream!)),
  );
  await client.send("Tracing.end");
  const stream = await traceReady;
  let trace = "";
  while (true) {
    const part = await client.send("IO.read", { handle: stream });
    trace += part.data;
    if (part.eof) break;
  }
  await client.send("IO.close", { handle: stream });
  const after = await metric();
  const events: Array<{ name: string; dur?: number; ph: string }> =
    JSON.parse(trace).traceEvents;
  const timeline: Record<string, { count: number; durationMs: number }> = {};
  for (const name of [
    "Paint",
    "PrePaint",
    "Layout",
    "UpdateLayoutTree",
    "Layerize",
    "CompositeLayers",
    "RasterTask",
  ]) {
    const matching = events.filter(
      (event) => event.name === name && event.ph === "X",
    );
    timeline[name] = {
      count: matching.length,
      durationMs:
        Math.round(
          (matching.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000) *
            100,
        ) / 100,
    };
  }
  const sorted = [...samples.intervals].sort((a, b) => a - b);
  const result = {
    phase,
    capturedAt: new Date().toISOString(),
    browser: await browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: { width: 1440, height: 1000, dpr: 1 },
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    rendering: await page.evaluate(() => ({
      engine:
        document.querySelector<HTMLElement>(".pl-scroll-hero")?.dataset
          .animationEngine ?? "legacy-raf",
      closeupSurface: document.querySelector<HTMLElement>(".pl-hero-closeup")
        ? {
            widthCssPx: 1800,
            sourceWidthPx: (
              document.querySelector(".pl-hero-closeup img") as HTMLImageElement
            ).naturalWidth,
            sourceHeightPx: (
              document.querySelector(".pl-hero-closeup img") as HTMLImageElement
            ).naturalHeight,
          }
        : null,
    })),
    workload:
      "One foreground headless Chrome tab, warm loaded assets, requestAnimationFrame scroll from hero start to end over 3000ms. CDP timeline tracing enabled in both runs. No CPU throttling.",
    scrollPx: samples.scrollPx,
    elapsedMs: samples.elapsedMs,
    rafSamples: sorted.length,
    rafIntervalMs: {
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted.at(-1),
      over25ms: sorted.filter((value) => value > 25).length,
      over50ms: sorted.filter((value) => value > 50).length,
    },
    metricsDelta: Object.fromEntries(
      [
        "LayoutCount",
        "RecalcStyleCount",
        "ScriptDuration",
        "TaskDuration",
        "LayoutDuration",
        "RecalcStyleDuration",
      ].map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)]),
    ),
    timeline,
    limits:
      "Single local run, scheduling intervals and CPU timeline events, not compositor FPS or human trackpad latency. Host/background load may vary. Paint duration does not include all GPU raster cost. Requires matching same-workload comparison; no device-wide performance guarantee.",
  };
  await mkdir("docs", { recursive: true });
  await writeFile(
    `docs/performance-hero-${phase}.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally {
  await browser.close();
}
