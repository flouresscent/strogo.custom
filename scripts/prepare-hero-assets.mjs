import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Pre-render our local vector artwork once. Scrolling then composites small raster tiles,
// rather than re-rasterising complex SVG paths at a continuously changing scale.
const assets = [
  ["orbit.svg", "orbit"],
  ["contour.svg", "contour"],
  ["mono.svg", "mono"],
  ["custom-bloom.svg", "bloom"],
  ["custom-tide.svg", "tide"],
  ["custom-landscape.png", "landscape"],
];
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  for (const [source, name] of assets) {
    const bytes = await readFile(resolve("public/assets", source));
    const mime = source.endsWith(".svg") ? "image/svg+xml" : "image/png";
    const data = await page.evaluate(
      async ({ src, photo }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = photo ? 1800 : 1100;
        canvas.height = Math.round(canvas.width / 2.25);
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.93).split(",")[1];
      },
      {
        src: `data:${mime};base64,${bytes.toString("base64")}`,
        photo: name === "landscape",
      },
    );
    await writeFile(
      resolve("public/assets", `hero-${name}.webp`),
      Buffer.from(data, "base64"),
    );
    process.stdout.write(`hero-${name}.webp\n`);
  }
} finally {
  await browser.close();
}
