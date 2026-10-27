import {
  SIZE_OPTIONS,
  compositePixel,
  layerHeight,
  pointToSource,
  type Design,
  type ImageLayer,
  type Point,
} from "./domain";
import { assetUrl } from "../shared/urls";

// Local bundled examples and browser-local uploads only; never request customer art from a server.
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const renderVersions = new WeakMap<HTMLCanvasElement, number>();
let textContext: CanvasRenderingContext2D | null = null;

/** Same font and physical units as drawDesign; width is the widest natural line. */
export function measureTextWidth(
  text: string,
  fontFamily: string,
  fontSize: number,
): number {
  textContext ??= document.createElement("canvas").getContext("2d");
  if (!textContext)
    throw new Error(
      "Не удалось измерить текст. Обновите страницу в современном браузере.",
    );
  textContext.font = `700 ${fontSize}px "${fontFamily}"`;
  return Math.max(
    1,
    ...text.split("\n").map((line) => textContext!.measureText(line).width),
  );
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  if (
    !/^data:image\/(png|jpeg|webp);base64,/.test(src) &&
    !/^\/assets\/(contour|orbit|mono)\.svg$/.test(src) &&
    src !== "/assets/strogo-logo.png"
  ) {
    return Promise.reject(
      new Error(
        "Источник изображения недоступен. Загрузите файл с устройства.",
      ),
    );
  }
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(src);
      reject(
        new Error("Не удалось прочитать изображение. Попробуйте другой файл."),
      );
    };
    img.src = assetUrl(src);
  });
  // Limit decoded image retention; active image references remain valid through the drawing promise.
  if (imageCache.size >= 12) imageCache.delete(imageCache.keys().next().value!);
  imageCache.set(src, pending);
  return pending;
}

export async function drawDesign(
  canvas: HTMLCanvasElement,
  design: Design,
  options: { widthPx?: number } = {},
): Promise<void> {
  const version = (renderVersions.get(canvas) ?? 0) + 1;
  renderVersions.set(canvas, version);
  const size = SIZE_OPTIONS[design.size];
  const width = Math.min(
    6000,
    Math.max(1, Math.round(options.widthPx ?? 1800)),
  );
  const height = Math.round((width * size.height) / size.width);
  const loaded = await Promise.all(
    design.layers.map((l) =>
      l.type === "image" ? loadImage(l.src) : Promise.resolve(null),
    ),
  );
  const logo = design.showLogo
    ? await loadImage("/assets/strogo-logo.png")
    : null;
  if ("fonts" in document) await document.fonts.ready;
  if (renderVersions.get(canvas) !== version) return;
  // A render begins after resources resolve, so it never exposes a partly loaded export.
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error(
      "Браузер не поддерживает Canvas. Откройте страницу в современном браузере.",
    );
  ctx.setTransform(width / size.width, 0, 0, height / size.height, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  roundedRect(ctx, 0, 0, size.width, size.height, 9);
  ctx.clip();
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, size.width, size.height);
  design.layers.forEach((layer, i) => {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.type === "image") {
      ctx.drawImage(
        loaded[i]!,
        -layer.width / 2,
        -layerHeight(layer) / 2,
        layer.width,
        layerHeight(layer),
      );
    } else {
      ctx.fillStyle = layer.color;
      ctx.font = `700 ${layer.fontSize}px "${layer.fontFamily}"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = layer.text.split("\n");
      const measuredWidth = Math.max(
        ...lines.map((line) => ctx.measureText(line).width),
      );
      // New text boxes use measureTextWidth. Only down-fit older saved boxes; never
      // stretch short text, so font-size changes retain natural letter proportions.
      if (measuredWidth > 0) {
        if (measuredWidth > layer.width)
          ctx.scale(layer.width / measuredWidth, 1);
        const lineHeight = layer.fontSize * 1.25;
        lines.forEach((line, lineIndex) =>
          ctx.fillText(
            line,
            0,
            (lineIndex - (lines.length - 1) / 2) * lineHeight,
          ),
        );
      }
    }
    ctx.restore();
  });
  if (logo) {
    const logoWidth = 70;
    const logoHeight = (logoWidth * logo.naturalHeight) / logo.naturalWidth;
    ctx.drawImage(
      logo,
      size.width - 20 - logoWidth,
      size.height - 18 - logoHeight,
      logoWidth,
      logoHeight,
    );
  }
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pure print document only: no selection, stitching overlay, table props or scene transforms. */
export async function exportDesign(
  design: Design,
  widthPx = 2400,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await drawDesign(canvas, design, { widthPx });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else
        reject(
          new Error(
            "Не удалось экспортировать PNG. Попробуйте уменьшить исходное изображение.",
          ),
        );
    }, "image/png"),
  );
}

/** Sample the actual source pixel after inverse layer transform. Partial alpha blends over the chosen base. */
export async function sampleSourcePixel(
  layer: ImageLayer,
  point: Point,
  background: string,
): Promise<string> {
  const source = pointToSource(layer, point);
  if (!source)
    throw new Error("Нажмите на изображение, чтобы выбрать его цвет.");
  const image = await loadImage(layer.src);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error(
      "Пипетка недоступна в этом браузере. Используйте выбор цвета.",
    );
  try {
    ctx.drawImage(image, source.x, source.y, 1, 1, 0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const sampled = compositePixel(data, background);
    if (sampled === null)
      throw new Error(
        "Этот пиксель прозрачный. Выберите непрозрачную область изображения.",
      );
    return sampled;
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError")
      throw new Error(
        "Браузер запретил чтение пикселей. Загрузите изображение с устройства.",
      );
    throw error;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function clearImageCache(): void {
  imageCache.clear();
}
