/** All design geometry is in millimetres; rotations are clockwise degrees. */
export type SizeId = "wide" | "compact";
export const SIZE_OPTIONS = {
  wide: { id: "wide" as const, width: 900, height: 400, label: "90 × 40 см" },
  compact: {
    id: "compact" as const,
    width: 490,
    height: 420,
    label: "49 × 42 см",
  },
};
export const QUALITY_DPI = 150;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type Point = { x: number; y: number };
export type Pose = Point & { rotation: number };
interface LayerBase extends Pose {
  id: string;
  width: number;
}
export interface UploadedImage {
  src: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
}
export interface ImageLayer extends LayerBase, UploadedImage {
  type: "image";
}
export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
}
export type Layer = ImageLayer | TextLayer;
export interface Design {
  size: SizeId;
  background: string;
  layers: Layer[];
  showLogo: boolean;
}
export interface TableScene {
  rug: Pose;
  keyboard: Pose;
  mouse: Pose;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  updatedAt: string;
  design: Design;
  tableScene: TableScene;
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createProject(): Project {
  return {
    schemaVersion: 1,
    id: uid(),
    updatedAt: new Date().toISOString(),
    design: {
      size: "wide",
      background: "#171819",
      layers: [],
      showLogo: false,
    },
    tableScene: {
      rug: { x: 0, y: 0, rotation: -7 },
      keyboard: { x: -90, y: -70, rotation: -7 },
      mouse: { x: 220, y: -10, rotation: -7 },
    },
  };
}
export function createImageLayer(
  source: UploadedImage,
  design: Design,
): ImageLayer {
  const size = SIZE_OPTIONS[design.size];
  return fitImage(
    {
      ...source,
      id: uid(),
      type: "image",
      x: size.width / 2,
      y: size.height / 2,
      width: size.width,
      rotation: 0,
    },
    design,
    "contain",
  );
}
export function createTextLayer(design: Design): TextLayer {
  const size = SIZE_OPTIONS[design.size];
  return {
    id: uid(),
    type: "text",
    text: "ТВОЙ ДИЗАЙН",
    fontFamily: "Arial",
    fontSize: 35,
    color: "#ffffff",
    x: size.width / 2,
    y: size.height / 2,
    width: 300,
    rotation: 0,
  };
}
export function layerHeight(layer: Layer): number {
  return layer.type === "image"
    ? (layer.width * layer.naturalHeight) / layer.naturalWidth
    : layer.fontSize * 1.25 * layer.text.split("\n").length;
}
export function rotatePoint(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}
export function toLayerLocal(layer: Layer, point: Point): Point {
  return rotatePoint(
    { x: point.x - layer.x, y: point.y - layer.y },
    -layer.rotation,
  );
}
export function pointToSource(layer: ImageLayer, point: Point): Point | null {
  const local = toLayerLocal(layer, point);
  const height = layerHeight(layer);
  const x = (local.x / layer.width + 0.5) * layer.naturalWidth;
  const y = (local.y / height + 0.5) * layer.naturalHeight;
  return x >= 0 && y >= 0 && x < layer.naturalWidth && y < layer.naturalHeight
    ? { x: Math.floor(x), y: Math.floor(y) }
    : null;
}
export function hitTest(layer: Layer, point: Point, tolerance = 0): boolean {
  const local = toLayerLocal(layer, point);
  return (
    Math.abs(local.x) <= layer.width / 2 + tolerance &&
    Math.abs(local.y) <= layerHeight(layer) / 2 + tolerance
  );
}
export function getEffectiveDpi(layer: ImageLayer): number {
  return (layer.naturalWidth * 25.4) / layer.width;
}
/** A transparent source has no selectable colour; partial alpha uses the user's current base. */
export function compositePixel(
  rgba: readonly number[] | Uint8ClampedArray,
  background: string,
): string | null {
  const alpha = rgba[3]! / 255;
  if (alpha === 0) return null;
  const base = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(rgba[i]! * alpha + base[i]! * (1 - alpha))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function fitImage(
  layer: ImageLayer,
  design: Design,
  mode: "contain" | "cover",
): ImageLayer {
  const size = SIZE_OPTIONS[design.size];
  const ratio = layer.naturalWidth / layer.naturalHeight;
  const width =
    mode === "cover"
      ? Math.max(size.width, size.height * ratio)
      : Math.min(size.width, size.height * ratio);
  return {
    ...layer,
    x: size.width / 2,
    y: size.height / 2,
    width,
    rotation: 0,
  };
}
/** Size changes change only the print boundary, preserving artwork's physical placement. */
export function resizeDesign(design: Design, size: SizeId): Design {
  return { ...design, size };
}
export function layerExceedsBounds(layer: Layer, design: Design): boolean {
  const size = SIZE_OPTIONS[design.size];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].some(([sx, sy]) => {
    const corner = rotatePoint(
      { x: (sx! * layer.width) / 2, y: (sy! * layerHeight(layer)) / 2 },
      layer.rotation,
    );
    return (
      layer.x + corner.x < -0.01 ||
      layer.y + corner.y < -0.01 ||
      layer.x + corner.x > size.width + 0.01 ||
      layer.y + corner.y > size.height + 0.01
    );
  });
}
export function screenToDocument(
  point: Point,
  viewport: { left: number; top: number; scale: number },
): Point {
  return {
    x: (point.x - viewport.left) / viewport.scale,
    y: (point.y - viewport.top) / viewport.scale,
  };
}
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
});
/** Project values are acyclic plain data. Shared layers and image strings short-circuit
 * before walking changed fields, avoiding reserializing large upload data URLs. */
function equalHistoryValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length)
    return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      equalHistoryValue(left[key], right[key]),
  );
}
export function commitHistory<T>(history: History<T>, next: T): History<T> {
  if (equalHistoryValue(history.present, next)) return history;
  return {
    past: [...history.past.slice(-39), history.present],
    present: next,
    future: [],
  };
}
export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future],
  };
}
export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0]!,
    future: history.future.slice(1),
  };
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, limit = 100_000): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const color = (v: unknown): v is string =>
  typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
const pose = (v: unknown): boolean =>
  record(v) && finite(v.x) && finite(v.y) && finite(v.rotation, 36000);
const safeSource = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= 28_000_000 &&
  (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
    /^\/assets\/(contour|orbit|mono)\.svg$/.test(v));
export function validateProject(value: unknown): value is Project {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    !value.id.length ||
    value.id.length > 150 ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    return false;
  const d = value.design;
  if (
    !record(d) ||
    (d.size !== "wide" && d.size !== "compact") ||
    !color(d.background) ||
    typeof d.showLogo !== "boolean" ||
    !Array.isArray(d.layers) ||
    d.layers.length > 50
  )
    return false;
  const ids = new Set<string>();
  for (const l of d.layers) {
    if (
      !record(l) ||
      typeof l.id !== "string" ||
      !l.id.length ||
      l.id.length > 150 ||
      ids.has(l.id) ||
      !pose(l) ||
      !finite(l.width, l.type === "text" ? 200_000 : 20_000) ||
      l.width <= 0
    )
      return false;
    ids.add(l.id);
    if (l.type === "image") {
      if (
        !safeSource(l.src) ||
        typeof l.name !== "string" ||
        l.name.length > 300 ||
        !Number.isInteger(l.naturalWidth) ||
        !Number.isInteger(l.naturalHeight) ||
        !finite(l.naturalWidth) ||
        !finite(l.naturalHeight) ||
        l.naturalWidth <= 0 ||
        l.naturalHeight <= 0 ||
        l.naturalWidth * l.naturalHeight > MAX_IMAGE_PIXELS
      )
        return false;
    } else if (l.type === "text") {
      if (
        typeof l.text !== "string" ||
        l.text.length > 300 ||
        !["Arial", "Georgia", "Courier New"].includes(String(l.fontFamily)) ||
        !finite(l.fontSize, 1000) ||
        l.fontSize <= 0 ||
        !color(l.color)
      )
        return false;
    } else return false;
  }
  const scene = value.tableScene;
  return (
    record(scene) &&
    pose(scene.rug) &&
    pose(scene.keyboard) &&
    pose(scene.mouse)
  );
}
