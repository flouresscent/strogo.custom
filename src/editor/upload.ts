import { MAX_FILE_BYTES, MAX_IMAGE_PIXELS, type UploadedImage } from "./domain";

export type RasterFormat = "png" | "jpeg" | "webp";
export function detectImageFormat(bytes: Uint8Array): RasterFormat | null {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

/** Header bounds avoid decoding files whose declared dimensions already exceed the pixel budget. */
export function readImageDimensions(
  bytes: Uint8Array,
  format: RasterFormat,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png" && bytes.length >= 24)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (format === "webp" && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X")
      return {
        width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
      };
    if (
      chunk === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (chunk === "VP8L" && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
  }
  if (format === "jpeg") {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 255) return null;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++]!;
      if (marker === 217 || marker === 218) return null;
      if (marker >= 208 && marker <= 215) continue;
      if (i + 2 > bytes.length) return null;
      const length = view.getUint16(i);
      if (length < 2 || i + length > bytes.length) return null;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        return { width: view.getUint16(i + 5), height: view.getUint16(i + 3) };
      }
      i += length;
    }
  }
  return null;
}
function checkDimensions(width: number, height: number) {
  if (
    width <= 0 ||
    height <= 0 ||
    width > 16384 ||
    height > 16384 ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error(
      "Изображение слишком большое: максимум 40 мегапикселей и 16 384 px по стороне.",
    );
}
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!file.size) throw new Error("Файл пустой. Выберите другое изображение.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error(
      "Файл больше 20 МБ. Уменьшите его размер и попробуйте снова.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectImageFormat(bytes);
  if (!format)
    throw new Error(
      "Поддерживаются только PNG, JPG и WebP. Содержимое файла должно соответствовать формату.",
    );
  const dimensions = readImageDimensions(bytes, format);
  if (!dimensions)
    throw new Error(
      "Не удалось прочитать размер изображения. Файл повреждён или имеет неподдерживаемое кодирование.",
    );
  checkDimensions(dimensions.width, dimensions.height);
  // Object URLs are transient and always revoked; original image data stays only in memory/IndexedDB.
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new Error(
            "Изображение повреждено. Попробуйте сохранить его заново в PNG или JPG.",
          ),
        );
      img.src = url;
    });
    // Modern browsers apply EXIF orientation consistently to natural dimensions and drawImage.
    checkDimensions(image.naturalWidth, image.naturalHeight);
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Не удалось прочитать файл. Выберите его ещё раз."));
      const normalizedType =
        format === "jpeg" ? "image/jpeg" : `image/${format}`;
      reader.readAsDataURL(new Blob([bytes], { type: normalizedType }));
    });
    return {
      src,
      name: file.name.slice(0, 300),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
