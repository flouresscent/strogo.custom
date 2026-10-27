import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  SIZE_OPTIONS,
  QUALITY_DPI,
  createProject,
  createImageLayer,
  createTextLayer,
  layerHeight,
  hitTest,
  getEffectiveDpi,
  fitImage,
  resizeDesign,
  layerExceedsBounds,
  createHistory,
  commitHistory,
  undoHistory,
  redoHistory,
  type Project,
  type Layer,
  type ImageLayer,
  type UploadedImage,
  type Point,
  type SizeId,
} from "./domain";
import {
  drawDesign,
  exportDesign,
  sampleSourcePixel,
  measureTextWidth,
  clearImageCache,
} from "./render";
import { uploadImage } from "./upload";
import { saveProject, loadProject, clearProject } from "./persistence";
import { addToDemoCart } from "../checkout";
import { appUrl, assetUrl } from "../shared/urls";
import "./editor.css";

const EXAMPLES = [
  { id: "contour", name: "Рельеф", color: "#c4bdad" },
  { id: "orbit", name: "Орбита", color: "#8589a1" },
  { id: "mono", name: "Моно", color: "#e2e1da" },
];
const TOOL_OPTIONS = [
  ["image", "Изображение"],
  ["text", "Текст"],
  ["background", "Фон"],
] as const;
type Mode = "design" | "scene";
type Gesture = {
  kind: "move" | "scale" | "rotate";
  start: Point;
  layer: Layer;
  project: Project;
};
type SceneObject = "rug" | "keyboard" | "mouse";
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось выполнить действие. Попробуйте ещё раз.";

function NumberControl({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="editor-number">
      <span>{label}</span>
      <span>
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={Math.round(value * 10) / 10}
          onChange={(event) => {
            if (
              event.target.value !== "" &&
              Number.isFinite(event.target.valueAsNumber)
            )
              onChange(clamp(event.target.valueAsNumber, min, max));
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

function PreviewCanvas({
  project,
  className = "",
}: {
  project: Project;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const temporary = document.createElement("canvas");
    void drawDesign(temporary, project.design, { widthPx: 1500 })
      .then(() => {
        if (!active || !ref.current) return;
        ref.current.width = temporary.width;
        ref.current.height = temporary.height;
        ref.current.getContext("2d")?.drawImage(temporary, 0, 0);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [project.design]);
  return (
    <>
      <canvas
        className={className}
        ref={ref}
        aria-label="Предпросмотр вашего дизайна"
      />
      {failed && (
        <p role="alert" className="editor-error">
          Не удалось отобразить изображение. Замените файл.
        </p>
      )}
    </>
  );
}

export default function Editor() {
  const [history, setHistory] = useState(() => createHistory(createProject()));
  const [project, setProject] = useState(history.present);
  const projectRef = useRef(project);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("design");
  const [tool, setTool] = useState("image");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [eyedropper, setEyedropper] = useState(false);
  const [pendingImage, setPendingImage] = useState<UploadedImage | null>(null);
  const [savedDraft, setSavedDraft] = useState<Project | null>(null);
  const [cartAdded, setCartAdded] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartPreview, setCartPreview] = useState<Project | null>(null);
  const [sceneObject, setSceneObject] = useState<SceneObject>("rug");
  const [zoom, setZoom] = useState(100);
  const [hex, setHex] = useState(project.design.background);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const sceneGesture = useRef<{
    object: SceneObject;
    x: number;
    y: number;
    project: Project;
    scale: number;
  } | null>(null);
  const uploadDialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const size = SIZE_OPTIONS[project.design.size];
  const selected = project.design.layers.find(
    (layer) => layer.id === selectedId,
  );
  const imageLayers = project.design.layers.filter(
    (layer): layer is ImageLayer => layer.type === "image",
  );
  const rasterLayers = imageLayers.filter(
    (layer) => !layer.src.startsWith("/assets/"),
  );
  const lowestDpi = rasterLayers.length
    ? Math.min(...rasterLayers.map(getEffectiveDpi))
    : null;
  const exceeds = project.design.layers.some((layer) =>
    layerExceedsBounds(layer, project.design),
  );

  const live = useCallback((next: Project) => {
    projectRef.current = next;
    setProject(next);
  }, []);
  const commit = useCallback(
    (next: Project) => {
      live(next);
      setHistory((previous) => commitHistory(previous, next));
      setError("");
    },
    [live],
  );
  const updateDesign = (patch: Partial<Project["design"]>) =>
    commit({
      ...projectRef.current,
      design: { ...projectRef.current.design, ...patch },
    });
  const updateLayer = (patch: Partial<Layer>) => {
    if (!selectedId) return;
    updateDesign({
      layers: projectRef.current.design.layers.map((layer) => {
        if (layer.id !== selectedId) return layer;
        const next = { ...layer, ...patch } as Layer;
        if (
          next.type === "text" &&
          !("width" in patch) &&
          ("text" in patch || "fontFamily" in patch || "fontSize" in patch)
        ) {
          return {
            ...next,
            width: measureTextWidth(next.text, next.fontFamily, next.fontSize),
          };
        }
        return next;
      }),
    });
  };
  const undo = useCallback(
    () =>
      setHistory((previous) => {
        const next = undoHistory(previous);
        live(next.present);
        return next;
      }),
    [live],
  );
  const redo = useCallback(
    () =>
      setHistory((previous) => {
        const next = redoHistory(previous);
        live(next.present);
        return next;
      }),
    [live],
  );

  useEffect(() => {
    let active = true;
    void loadProject()
      .then((draft) => {
        if (active) setSavedDraft(draft);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => () => clearImageCache(), []);
  useEffect(() => {
    setHex(project.design.background);
  }, [project.design.background]);
  useEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      void drawDesign(canvas, project.design, {
        widthPx: Math.min(2400, Math.max(1200, size.width * 2)),
      }).catch((reason) => {
        if (active) setError(errorText(reason));
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [project.design, size.width, mode]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea, select, dialog") ||
          event.target.isContentEditable)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setEyedropper(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  async function chooseFile(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      setPendingImage(await uploadImage(file));
      uploadDialog.current?.showModal();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function placeImage() {
    if (!pendingImage) return;
    const layer = createImageLayer(pendingImage, project.design);
    const layers = project.design.layers.filter(
      (item) => item.id !== selectedId || item.type !== "image",
    );
    if (layers.length >= 50) {
      uploadDialog.current?.close();
      setPendingImage(null);
      setError(
        "В проекте может быть не более 50 элементов. Удалите элемент перед загрузкой.",
      );
      return;
    }
    updateDesign({ layers: [...layers, layer] });
    setSelectedId(layer.id);
    setPendingImage(null);
    setTool("image");
    setMode("design");
    uploadDialog.current?.close();
    setStatus("Изображение добавлено. Перетащите его или настройте положение.");
  }
  function addText() {
    if (project.design.layers.length >= 50) {
      setError("В проекте может быть не более 50 элементов.");
      return;
    }
    const initial = createTextLayer(project.design);
    const layer = {
      ...initial,
      width: measureTextWidth(
        initial.text,
        initial.fontFamily,
        initial.fontSize,
      ),
    };
    updateDesign({ layers: [...project.design.layers, layer] });
    setSelectedId(layer.id);
    setTool("text");
    setMode("design");
  }
  function applyExample(id: string) {
    const layer = createImageLayer(
      {
        src: `/assets/${id}.svg`,
        name: EXAMPLES.find((item) => item.id === id)?.name ?? id,
        naturalWidth: 1800,
        naturalHeight: 800,
      },
      project.design,
    );
    updateDesign({ layers: [fitImage(layer, project.design, "cover")] });
    setSelectedId(layer.id);
    setMode("design");
    setStatus("Демо-принт применён. Его можно перемещать и менять.");
  }
  function point(event: ReactPointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * size.width,
      y: ((event.clientY - rect.top) / rect.height) * size.height,
    };
  }
  async function startPointer(
    event: ReactPointerEvent<HTMLElement>,
    forcedKind?: Gesture["kind"],
  ) {
    if (mode !== "design" || !canvasRef.current || event.button !== 0) return;
    const p = point(event);
    if (eyedropper) {
      const layer = [...project.design.layers]
        .reverse()
        .find((item) => item.type === "image" && hitTest(item, p)) as
        ImageLayer | undefined;
      if (!layer) {
        setError("Нажмите на изображение, чтобы взять его цвет.");
        return;
      }
      try {
        updateDesign({
          background: await sampleSourcePixel(
            layer,
            p,
            project.design.background,
          ),
        });
        setStatus(
          "Цвет взят из пикселя изображения; прозрачность смешана с фоном.",
        );
        setEyedropper(false);
      } catch (reason) {
        setError(errorText(reason));
      }
      return;
    }
    const layer = forcedKind
      ? selected
      : [...project.design.layers]
          .reverse()
          .find((item) => hitTest(item, p, 5));
    if (!layer) {
      setSelectedId(null);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(layer.id);
    setTool(layer.type === "text" ? "text" : "image");
    gesture.current = {
      kind: forcedKind ?? "move",
      start: p,
      layer,
      project: projectRef.current,
    };
  }
  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag) return;
    const p = point(event);
    let layer = drag.layer;
    if (drag.kind === "move")
      layer = {
        ...layer,
        x: clamp(layer.x + p.x - drag.start.x, -size.width, size.width * 2),
        y: clamp(layer.y + p.y - drag.start.y, -size.height, size.height * 2),
      };
    if (drag.kind === "scale") {
      const origin = Math.hypot(drag.start.x - layer.x, drag.start.y - layer.y);
      const ratio =
        Math.hypot(p.x - layer.x, p.y - layer.y) / Math.max(1, origin);
      const width = clamp(layer.width * ratio, 5, size.width * 5);
      layer =
        layer.type === "text"
          ? { ...layer, width, fontSize: clamp(layer.fontSize * ratio, 2, 500) }
          : { ...layer, width };
    }
    if (drag.kind === "rotate") {
      const startAngle = Math.atan2(
        drag.start.y - layer.y,
        drag.start.x - layer.x,
      );
      const angle = Math.atan2(p.y - layer.y, p.x - layer.x);
      let rotation =
        (layer.rotation + ((angle - startAngle) * 180) / Math.PI) % 360;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      layer = { ...layer, rotation };
    }
    live({
      ...drag.project,
      design: {
        ...drag.project.design,
        layers: drag.project.design.layers.map((item) =>
          item.id === layer.id ? layer : item,
        ),
      },
    });
  }
  function endPointer() {
    if (gesture.current) {
      gesture.current = null;
      commit(projectRef.current);
    }
  }
  function align(
    direction: "center" | "horizontal" | "vertical" | "left" | "right",
  ) {
    if (!selected) return;
    const angle = (selected.rotation * Math.PI) / 180;
    const half =
      (Math.abs(Math.cos(angle)) * selected.width) / 2 +
      (Math.abs(Math.sin(angle)) * layerHeight(selected)) / 2;
    updateLayer(
      direction === "left"
        ? { x: half }
        : direction === "right"
          ? { x: size.width - half }
          : direction === "horizontal"
            ? { x: size.width / 2 }
            : direction === "vertical"
              ? { y: size.height / 2 }
              : { x: size.width / 2, y: size.height / 2 },
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveProject(projectRef.current);
      setSavedDraft(null);
      setStatus(
        "Проект сохранён в этом браузере. При следующем открытии его можно восстановить.",
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await exportDesign(projectRef.current.design);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `strogo-custom-${project.design.size}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        "PNG-превью скачано. Производственные параметры печати пока не определены.",
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    commit(createProject());
    setSelectedId(null);
    setSavedDraft(null);
    resetDialog.current?.close();
    setStatus("Новый чистый проект.");
    try {
      await clearProject();
      setStatus("Новый чистый проект. Сохранённый черновик удалён.");
    } catch (reason) {
      setError(
        `Дизайн сброшен, но сохранённый черновик не удалён. ${errorText(reason)}`,
      );
    }
  }
  function startScene(
    event: ReactPointerEvent<HTMLDivElement>,
    object: SceneObject,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSceneObject(object);
    const scene = event.currentTarget
      .closest(".editor-desk")!
      .getBoundingClientRect();
    sceneGesture.current = {
      object,
      x: event.clientX,
      y: event.clientY,
      project: projectRef.current,
      scale: scene.width / 1200,
    };
  }
  function moveScene(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = sceneGesture.current;
    if (!drag) return;
    const pose = drag.project.tableScene[drag.object];
    live({
      ...drag.project,
      tableScene: {
        ...drag.project.tableScene,
        [drag.object]: {
          ...pose,
          x: clamp(pose.x + (event.clientX - drag.x) / drag.scale, -500, 500),
          y: clamp(pose.y + (event.clientY - drag.y) / drag.scale, -350, 350),
        },
      },
    });
  }
  function endScene() {
    if (sceneGesture.current) {
      sceneGesture.current = null;
      commit(projectRef.current);
    }
  }
  function openCart() {
    if (!project.design.layers.length) {
      setError(
        "Добавьте изображение, текст или демо-принт перед продолжением.",
      );
      return;
    }
    setCartPreview(project);
    setCartAdded(false);
    cartDialog.current?.showModal();
  }

  const sceneStyle = (object: SceneObject) => ({
    transform: `translate(${project.tableScene[object].x / 12}cqw, ${project.tableScene[object].y / 12}cqw) rotate(${project.tableScene[object].rotation}deg)`,
  });

  return (
    <section className="custom-editor" aria-label="Конструктор коврика">
      <div className="editor-topline">
        <div>
          <a className="editor-back" href={appUrl("/custom")}>
            ← Strogo Custom
          </a>
          <h1>Твоя территория.</h1>
        </div>
        <div className="editor-document-actions">
          <button
            className="editor-icon-button"
            aria-label="Отменить действие"
            disabled={!history.past.length}
            onClick={undo}
          >
            ↶
          </button>
          <button
            className="editor-icon-button"
            aria-label="Повторить действие"
            disabled={!history.future.length}
            onClick={redo}
          >
            ↷
          </button>
          <span className="editor-action-divider" />
          <button
            className="button button-ghost"
            disabled={busy}
            onClick={save}
          >
            Сохранить
          </button>
          <button
            className="editor-icon-button editor-reset"
            aria-label="Сбросить проект"
            onClick={() => resetDialog.current?.showModal()}
          >
            ↺
          </button>
        </div>
      </div>

      {savedDraft && (
        <div className="editor-restore">
          <span>В этом браузере есть сохранённый проект.</span>
          <button
            onClick={() => {
              commit(savedDraft);
              setSavedDraft(null);
              setSelectedId(null);
              setStatus("Проект восстановлен.");
            }}
          >
            Восстановить
          </button>
          <button
            aria-label="Закрыть предложение восстановления"
            onClick={() => setSavedDraft(null)}
          >
            ×
          </button>
        </div>
      )}
      <div className="editor-messages" aria-live="polite">
        {busy && <p className="editor-status">Обрабатываем…</p>}
        {error ? (
          <p className="editor-error" role="alert">
            {error}
            <button
              aria-label="Закрыть сообщение об ошибке"
              onClick={() => setError("")}
            >
              ×
            </button>
          </p>
        ) : (
          status && (
            <p className="editor-status">
              {status}
              <button
                aria-label="Закрыть уведомление"
                onClick={() => setStatus("")}
              >
                ×
              </button>
            </p>
          )
        )}
      </div>

      <div className="editor-layout">
        <aside className="editor-tools" aria-label="Инструменты дизайна">
          <section className="editor-size-section">
            <div className="editor-section-title">
              <span>01</span>
              <h2>Размер коврика</h2>
            </div>
            <div className="editor-size-options">
              {Object.values(SIZE_OPTIONS).map((option) => (
                <button
                  key={option.id}
                  className={
                    project.design.size === option.id ? "is-active" : ""
                  }
                  aria-pressed={project.design.size === option.id}
                  onClick={() => {
                    commit({
                      ...project,
                      design: resizeDesign(project.design, option.id as SizeId),
                    });
                    setStatus(
                      "Размер изменён. Положение и физический масштаб элементов сохранены; выступающие края обрезаются.",
                    );
                  }}
                >
                  <span className={`editor-size-shape ${option.id}`} />
                  <strong>{option.label}</strong>
                  <small>
                    {option.id === "wide" ? "Для всего сетапа" : "Для движения"}
                  </small>
                </button>
              ))}
            </div>
          </section>
          <section className="editor-design-section">
            <div className="editor-section-title">
              <span>02</span>
              <h2>Твой дизайн</h2>
            </div>
            <div
              className="editor-tool-tabs"
              role="tablist"
              aria-label="Вид инструмента"
            >
              {TOOL_OPTIONS.map(([id, label], index) => (
                <button
                  key={id}
                  role="tab"
                  tabIndex={tool === id ? 0 : -1}
                  aria-selected={tool === id}
                  aria-controls={`editor-panel-${id}`}
                  id={`editor-tab-${id}`}
                  onClick={() => setTool(id)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const nextIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? TOOL_OPTIONS.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              TOOL_OPTIONS.length) %
                            TOOL_OPTIONS.length;
                    const next = TOOL_OPTIONS[nextIndex]!;
                    setTool(next[0]);
                    document.getElementById(`editor-tab-${next[0]}`)?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
            {tool === "image" && (
              <div
                role="tabpanel"
                id="editor-panel-image"
                aria-labelledby="editor-tab-image"
              >
                <button
                  className={`editor-upload ${dragOver ? "is-dragging" : ""}`}
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    void chooseFile(event.dataTransfer.files[0]);
                  }}
                >
                  <span className="editor-upload-icon">↑</span>
                  <strong>
                    {busy
                      ? "Читаем изображение…"
                      : selected?.type === "image"
                        ? "Заменить изображение"
                        : "Загрузи своё изображение"}
                  </strong>
                  <span>или перетащи файл сюда</span>
                  <small>PNG, JPG, WebP · до 20 МБ</small>
                </button>
                <div className="editor-examples-heading">
                  <span>Или начни с примера</span>
                  <small>Демо-принты</small>
                </div>
                <div className="editor-example-options">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.id}
                      onClick={() => applyExample(example.id)}
                      aria-label={`Применить принт ${example.name}`}
                    >
                      <img
                        src={assetUrl(`/assets/${example.id}.svg`)}
                        alt=""
                        style={{ background: example.color }}
                      />
                      <span>{example.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tool === "text" && (
              <div
                role="tabpanel"
                id="editor-panel-text"
                aria-labelledby="editor-tab-text"
                className="editor-text-tools"
              >
                <button className="button button-ghost" onClick={addText}>
                  ＋ Добавить надпись
                </button>
                {selected?.type === "text" && (
                  <>
                    <label className="editor-field">
                      Текст
                      <textarea
                        value={selected.text}
                        maxLength={300}
                        rows={2}
                        onChange={(event) =>
                          updateLayer({ text: event.target.value })
                        }
                      />
                    </label>
                    <label className="editor-field">
                      Шрифт
                      <select
                        value={selected.fontFamily}
                        onChange={(event) =>
                          updateLayer({ fontFamily: event.target.value })
                        }
                      >
                        <option value="Arial">Гротеск</option>
                        <option value="Georgia">Антиква</option>
                        <option value="Courier New">Моноширинный</option>
                      </select>
                    </label>
                    <div className="editor-control-row">
                      <NumberControl
                        label="Кегль"
                        value={selected.fontSize}
                        min={2}
                        max={500}
                        unit="мм"
                        onChange={(value) => updateLayer({ fontSize: value })}
                      />
                      <label className="editor-color-label">
                        Цвет
                        <input
                          type="color"
                          aria-label="Цвет текста"
                          value={selected.color}
                          onChange={(event) =>
                            updateLayer({ color: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}
            {tool === "background" && (
              <div
                role="tabpanel"
                id="editor-panel-background"
                aria-labelledby="editor-tab-background"
              >
                <p className="editor-small-copy">
                  Цвет под изображением и прозрачными участками.
                </p>
                <div className="editor-swatches">
                  {[
                    "#171819",
                    "#f3f1e9",
                    "#858079",
                    "#4d5046",
                    "#686272",
                    "#6e4144",
                  ].map((color) => (
                    <button
                      key={color}
                      aria-label={`Фон ${color}`}
                      aria-pressed={project.design.background === color}
                      className={
                        project.design.background === color ? "is-active" : ""
                      }
                      style={{ background: color }}
                      onClick={() => updateDesign({ background: color })}
                    />
                  ))}
                </div>
                <div className="editor-custom-color">
                  <input
                    type="color"
                    aria-label="Произвольный цвет фона"
                    value={project.design.background}
                    onChange={(event) =>
                      updateDesign({ background: event.target.value })
                    }
                  />
                  <input
                    type="text"
                    aria-label="HEX цвета фона"
                    value={hex}
                    maxLength={7}
                    onChange={(event) => {
                      setHex(event.target.value);
                      if (/^#[\da-f]{6}$/i.test(event.target.value))
                        updateDesign({ background: event.target.value });
                    }}
                    onBlur={() => {
                      if (!/^#[\da-f]{6}$/i.test(hex)) {
                        setHex(project.design.background);
                        setError("Введите HEX в формате #RRGGBB.");
                      }
                    }}
                  />
                </div>
                <button
                  className={`button button-ghost editor-eyedropper ${eyedropper ? "is-active" : ""}`}
                  disabled={!imageLayers.length}
                  aria-pressed={eyedropper}
                  onClick={() => {
                    setMode("design");
                    setEyedropper(!eyedropper);
                    setStatus(
                      "Нажмите на изображение на коврике. Прозрачность смешивается с текущим фоном.",
                    );
                  }}
                >
                  ⌖ Взять цвет с изображения
                </button>
              </div>
            )}
          </section>

          {selected && (
            <section className="editor-transform-section">
              <div className="editor-section-title">
                <span>03</span>
                <h2>
                  {selected.type === "image"
                    ? "Положение изображения"
                    : "Положение текста"}
                </h2>
                <button
                  className="editor-delete"
                  aria-label="Удалить выбранный элемент"
                  onClick={() => {
                    updateDesign({
                      layers: project.design.layers.filter(
                        (layer) => layer.id !== selected.id,
                      ),
                    });
                    setSelectedId(null);
                  }}
                >
                  Удалить
                </button>
              </div>
              <div className="editor-control-row">
                <NumberControl
                  label="По X"
                  value={selected.x}
                  min={-size.width}
                  max={size.width * 2}
                  unit="мм"
                  onChange={(value) => updateLayer({ x: value })}
                />
                <NumberControl
                  label="По Y"
                  value={selected.y}
                  min={-size.height}
                  max={size.height * 2}
                  unit="мм"
                  onChange={(value) => updateLayer({ y: value })}
                />
              </div>
              <label className="editor-slider-label">
                <span>
                  Масштаб{" "}
                  <strong>
                    {Math.round((selected.width / size.width) * 100)}%
                  </strong>
                </span>
                <input
                  type="range"
                  aria-label="Масштаб элемента"
                  min={2}
                  max={500}
                  value={(selected.width / size.width) * 100}
                  onChange={(event) => {
                    const width =
                      (size.width * Number(event.target.value)) / 100;
                    updateLayer(
                      selected.type === "text"
                        ? {
                            width,
                            fontSize: clamp(
                              (selected.fontSize * width) / selected.width,
                              2,
                              500,
                            ),
                          }
                        : { width },
                    );
                  }}
                />
              </label>
              <div className="editor-control-row">
                <NumberControl
                  label="Поворот"
                  value={selected.rotation}
                  min={-360}
                  max={360}
                  unit="°"
                  onChange={(value) => updateLayer({ rotation: value })}
                />
                <button
                  className="editor-text-button"
                  onClick={() => updateLayer({ rotation: 0 })}
                >
                  Вернуть 0°
                </button>
              </div>
              <div className="editor-align">
                <button
                  onClick={() => align("left")}
                  aria-label="Выровнять по левому краю"
                >
                  ⇤
                </button>
                <button
                  onClick={() => align("horizontal")}
                  aria-label="Выровнять по горизонтальному центру"
                >
                  ↔
                </button>
                <button
                  onClick={() => align("vertical")}
                  aria-label="Выровнять по вертикальному центру"
                >
                  ↕
                </button>
                <button
                  onClick={() => align("right")}
                  aria-label="Выровнять по правому краю"
                >
                  ⇥
                </button>
                <button onClick={() => align("center")}>В центр</button>
              </div>
              {selected.type === "image" && (
                <div className="editor-fit">
                  <button
                    onClick={() =>
                      updateLayer(fitImage(selected, project.design, "cover"))
                    }
                  >
                    Заполнить коврик
                  </button>
                  <button
                    onClick={() =>
                      updateLayer(fitImage(selected, project.design, "contain"))
                    }
                  >
                    Вписать / сбросить
                  </button>
                </div>
              )}
            </section>
          )}

          {project.design.layers.length > 0 && (
            <section className="editor-layer-section">
              <h3>
                Элементы <span>{project.design.layers.length}</span>
              </h3>
              <div className="editor-layer-list">
                {[...project.design.layers].reverse().map((layer) => (
                  <button
                    key={layer.id}
                    className={layer.id === selectedId ? "is-active" : ""}
                    aria-pressed={layer.id === selectedId}
                    onClick={() => {
                      setSelectedId(layer.id);
                      setTool(layer.type === "text" ? "text" : "image");
                      setMode("design");
                    }}
                  >
                    <span>{layer.type === "text" ? "T" : "▧"}</span>
                    <span>
                      {layer.type === "text"
                        ? layer.text || "Пустой текст"
                        : layer.name}
                    </span>
                    <small>↗</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <label className="editor-logo-option">
            <input
              type="checkbox"
              checked={project.design.showLogo}
              onChange={(event) =>
                updateDesign({ showLogo: event.target.checked })
              }
            />
            <span>
              Логотип Strogo <small>· демо</small>
            </span>
          </label>
          <p className="editor-local-note">
            ↳ Файлы остаются в твоём браузере.
          </p>
          <button
            className="editor-text-button"
            onClick={() => resetDialog.current?.showModal()}
          >
            Начать заново
          </button>
        </aside>

        <section className="editor-workspace" aria-label="Рабочая область">
          <div className="editor-canvas-toolbar">
            <div
              className="editor-view-switch"
              role="group"
              aria-label="Режим просмотра"
            >
              <button
                className={mode === "design" ? "is-active" : ""}
                aria-pressed={mode === "design"}
                onClick={() => setMode("design")}
              >
                Редактирование
              </button>
              <button
                className={mode === "scene" ? "is-active" : ""}
                aria-pressed={mode === "scene"}
                onClick={() => {
                  setMode("scene");
                  setEyedropper(false);
                }}
              >
                На столе ↗
              </button>
            </div>
            <span className="editor-workspace-label">STROGO / CUSTOM</span>
          </div>
          {mode === "design" ? (
            <div
              className={`editor-flat-stage ${dragOver ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void chooseFile(event.dataTransfer.files[0]);
              }}
            >
              <div
                className="editor-rug-container"
                style={{
                  width: `${(Math.min(90, project.design.size === "compact" ? 61 : 90) * zoom) / 100}%`,
                  aspectRatio: size.width / size.height,
                }}
              >
                <span className="editor-dimension editor-dimension-top">
                  {size.width / 10} см
                </span>
                <span className="editor-dimension editor-dimension-side">
                  {size.height / 10} см
                </span>
                <div
                  className={`editor-rug ${eyedropper ? "is-eyedropper" : ""}`}
                  style={{ aspectRatio: size.width / size.height }}
                  tabIndex={0}
                  role="application"
                  aria-label="Дизайн коврика. Выберите элемент касанием. Стрелки перемещают выбранный элемент, Shift увеличивает шаг."
                  onPointerDown={(event) => void startPointer(event)}
                  onPointerMove={movePointer}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onKeyDown={(event) => {
                    if (
                      !selected ||
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Delete",
                        "Backspace",
                      ].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    if (event.key === "Delete" || event.key === "Backspace") {
                      updateDesign({
                        layers: project.design.layers.filter(
                          (item) => item.id !== selected.id,
                        ),
                      });
                      setSelectedId(null);
                      return;
                    }
                    const step = event.shiftKey ? 10 : 1;
                    updateLayer({
                      x:
                        selected.x +
                        (event.key === "ArrowLeft"
                          ? -step
                          : event.key === "ArrowRight"
                            ? step
                            : 0),
                      y:
                        selected.y +
                        (event.key === "ArrowUp"
                          ? -step
                          : event.key === "ArrowDown"
                            ? step
                            : 0),
                    });
                  }}
                >
                  <canvas ref={canvasRef} aria-hidden="true" />
                  <div className="editor-texture" />
                  {!project.design.layers.length && (
                    <button
                      className="editor-empty-canvas"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => fileRef.current?.click()}
                    >
                      <span>＋</span>
                      <strong>Здесь будет твой дизайн</strong>
                      <small>Загрузи изображение или выбери пример</small>
                    </button>
                  )}
                  {selected && !eyedropper && (
                    <div
                      className="editor-selection"
                      style={{
                        left: `${(selected.x / size.width) * 100}%`,
                        top: `${(selected.y / size.height) * 100}%`,
                        width: `${(selected.width / size.width) * 100}%`,
                        height: `${(layerHeight(selected) / size.height) * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${selected.rotation}deg)`,
                      }}
                    >
                      <span className="editor-selection-label">
                        {selected.type === "text" ? "Текст" : "Изображение"}
                      </span>
                      <button
                        className="editor-handle editor-rotate-handle"
                        aria-label="Повернуть элемент перетаскиванием"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          void startPointer(event, "rotate");
                        }}
                      >
                        ↻
                      </button>
                      {["tl", "tr", "bl", "br"].map((corner) => (
                        <button
                          key={corner}
                          className={`editor-handle editor-scale-${corner}`}
                          aria-label="Изменить размер элемента перетаскиванием"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            void startPointer(event, "scale");
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="editor-stage-caption">
                <span>
                  {eyedropper
                    ? "⌖ Нажми на нужный цвет изображения"
                    : selected
                      ? "Перемещай · тяни за угол · вращай"
                      : "Чистый лист. Полная свобода."}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="editor-desk"
              onPointerMove={moveScene}
              onPointerUp={endScene}
              onPointerCancel={endScene}
            >
              <div className="editor-desk-light" />
              <div
                className="editor-scene-rug"
                style={{
                  ...sceneStyle("rug"),
                  width: `${size.width / 12}%`,
                  marginLeft: `${-size.width / 24}%`,
                  marginTop: `${-size.height / 24}%`,
                  aspectRatio: size.width / size.height,
                }}
                onPointerDown={(event) => startScene(event, "rug")}
              >
                <PreviewCanvas project={project} />
                <div className="editor-texture" />
              </div>
              <div
                className="editor-keyboard"
                style={sceneStyle("keyboard")}
                onPointerDown={(event) => startScene(event, "keyboard")}
                role="img"
                aria-label="Клавиатура, можно переместить"
              >
                <div>
                  {Array.from({ length: 56 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
                <span>STROGO</span>
              </div>
              <div
                className="editor-mouse"
                style={sceneStyle("mouse")}
                onPointerDown={(event) => startScene(event, "mouse")}
                role="img"
                aria-label="Мышь, можно переместить"
              >
                <span />
              </div>
              <span className="editor-scene-disclaimer">
                Визуализация · цвета и материалы условные
              </span>
            </div>
          )}
          <div className="editor-stage-bottom">
            {mode === "design" ? (
              <>
                <span>Размеры и материалы — прототип</span>
                <label>
                  Вид{" "}
                  <select
                    aria-label="Масштаб рабочей области"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  >
                    <option value={70}>70%</option>
                    <option value={85}>85%</option>
                    <option value={100}>100%</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <span>Перемещай коврик, клавиатуру и мышь независимо</span>
                <button
                  className="editor-text-button"
                  onClick={() =>
                    commit({
                      ...project,
                      tableScene: createProject().tableScene,
                    })
                  }
                >
                  Сбросить сцену
                </button>
              </>
            )}
          </div>
          {mode === "scene" && (
            <div className="editor-scene-controls">
              <label>
                Предмет
                <select
                  aria-label="Предмет в сцене"
                  value={sceneObject}
                  onChange={(event) =>
                    setSceneObject(event.target.value as SceneObject)
                  }
                >
                  <option value="rug">Коврик</option>
                  <option value="keyboard">Клавиатура</option>
                  <option value="mouse">Мышь</option>
                </select>
              </label>
              <NumberControl
                label="Смещение X"
                min={-500}
                max={500}
                value={project.tableScene[sceneObject].x}
                onChange={(value) =>
                  commit({
                    ...project,
                    tableScene: {
                      ...project.tableScene,
                      [sceneObject]: {
                        ...project.tableScene[sceneObject],
                        x: value,
                      },
                    },
                  })
                }
              />
              <NumberControl
                label="Смещение Y"
                min={-350}
                max={350}
                value={project.tableScene[sceneObject].y}
                onChange={(value) =>
                  commit({
                    ...project,
                    tableScene: {
                      ...project.tableScene,
                      [sceneObject]: {
                        ...project.tableScene[sceneObject],
                        y: value,
                      },
                    },
                  })
                }
              />
              <NumberControl
                label="Угол сцены"
                min={-180}
                max={180}
                value={project.tableScene[sceneObject].rotation}
                unit="°"
                onChange={(value) =>
                  commit({
                    ...project,
                    tableScene: {
                      ...project.tableScene,
                      [sceneObject]: {
                        ...project.tableScene[sceneObject],
                        rotation: value,
                      },
                    },
                  })
                }
              />
            </div>
          )}
          <div className="editor-quality">
            <div>
              <span
                className={`editor-quality-dot ${lowestDpi !== null && lowestDpi < QUALITY_DPI ? "is-warning" : ""}`}
              />
              <strong>
                {lowestDpi === null
                  ? imageLayers.length
                    ? "Векторный демо-принт"
                    : "Готов к твоим идеям"
                  : lowestDpi >= QUALITY_DPI
                    ? "Хорошее качество"
                    : lowestDpi >= 75
                      ? "Возможно снижение чёткости"
                      : "Низкое разрешение"}
              </strong>
              {lowestDpi !== null && <span>{Math.round(lowestDpi)} DPI</span>}
            </div>
            <p>
              {lowestDpi === null
                ? "Загрузи картинку — оценим чёткость с учётом физического размера."
                : `Ориентир ${QUALITY_DPI} DPI. Это демо-оценка; требования определяет производитель.`}
            </p>
            {exceeds && (
              <p className="editor-crop-note">
                Часть дизайна выходит за коврик и будет обрезана. Выбери элемент
                → «Вписать» или уменьши масштаб.
              </p>
            )}
          </div>
          <div className="editor-product-summary">
            <div>
              <span className="editor-summary-kicker">ТВОЙ STROGO CUSTOM</span>
              <h2>Один в своём роде.</h2>
              <p>
                {size.label} <span> / </span> Индивидуальный дизайн
              </p>
            </div>
            <div className="editor-checkout">
              <span>Стоимость уточняется</span>
              <div>
                <button
                  className="button button-ghost"
                  disabled={busy}
                  onClick={download}
                >
                  PNG ↓
                </button>
                <button className="button button-primary" onClick={openCart}>
                  Продолжить <span>↗</span>
                </button>
              </div>
              <small>Демонстрация. Без оплаты и отправки заказа.</small>
            </div>
          </div>
        </section>
      </div>

      <dialog
        className="editor-dialog"
        aria-label="Предпросмотр загруженного изображения"
        ref={uploadDialog}
        onCancel={() => setPendingImage(null)}
      >
        <button
          className="editor-dialog-close"
          aria-label="Закрыть предпросмотр загрузки"
          onClick={() => {
            uploadDialog.current?.close();
            setPendingImage(null);
          }}
        >
          ×
        </button>
        <span className="editor-summary-kicker">НОВЫЙ ЭЛЕМЕНТ</span>
        <h2>Хорошо смотрится.</h2>
        {pendingImage && (
          <>
            <div className="editor-upload-preview">
              <img
                src={pendingImage.src}
                alt="Предпросмотр выбранного изображения"
              />
            </div>
            <p className="editor-file-description">
              {pendingImage.name}
              <br />
              {pendingImage.naturalWidth} × {pendingImage.naturalHeight} px
            </p>
          </>
        )}
        <p>Изображение останется в твоём браузере.</p>
        <button className="button button-primary" onClick={placeImage}>
          Разместить на коврике ↗
        </button>
      </dialog>
      <dialog
        className="editor-dialog"
        aria-label="Сброс проекта"
        ref={resetDialog}
      >
        <span className="editor-summary-kicker">НАЧАТЬ ЗАНОВО</span>
        <h2>Чистый лист?</h2>
        <p>
          Текущий дизайн и сохранённый черновик в этом браузере будут сброшены.
          Дизайн можно будет вернуть кнопкой отмены.
        </p>
        <div className="editor-dialog-actions">
          <button
            className="button button-ghost"
            onClick={() => resetDialog.current?.close()}
          >
            Оставить дизайн
          </button>
          <button
            className="button button-primary"
            onClick={() => void reset()}
          >
            Сбросить
          </button>
        </div>
      </dialog>
      <dialog
        className="editor-dialog editor-cart-dialog"
        aria-label="Демонстрационная корзина"
        ref={cartDialog}
      >
        <button
          className="editor-dialog-close"
          aria-label="Закрыть демо-корзину"
          onClick={() => cartDialog.current?.close()}
        >
          ×
        </button>
        <span className="editor-summary-kicker">ДЕМО-КОРЗИНА</span>
        <h2>{cartAdded ? "Твой дизайн в корзине." : "Всё по-твоему."}</h2>
        {cartPreview && (
          <>
            <div className="editor-cart-preview">
              <PreviewCanvas project={cartPreview} />
            </div>
            <dl>
              <div>
                <dt>Модель</dt>
                <dd>Strogo Custom</dd>
              </div>
              <div>
                <dt>Размер</dt>
                <dd>{SIZE_OPTIONS[cartPreview.design.size].label}</dd>
              </div>
              <div>
                <dt>Дизайн</dt>
                <dd>
                  {
                    cartPreview.design.layers.filter(
                      (layer) => layer.type === "image",
                    ).length
                  }{" "}
                  изображ. /{" "}
                  {
                    cartPreview.design.layers.filter(
                      (layer) => layer.type === "text",
                    ).length
                  }{" "}
                  надпис.
                </dd>
              </div>
              <div>
                <dt>Стоимость</dt>
                <dd>Уточняется</dd>
              </div>
            </dl>
          </>
        )}
        <p className="editor-demo-disclaimer">
          Это демонстрационный сценарий. Реальный заказ не создаётся, данные в
          магазин не отправляются, оплата не принимается.
        </p>
        <div className="editor-dialog-actions">
          <button
            className="button button-ghost"
            onClick={() => cartDialog.current?.close()}
          >
            К редактированию
          </button>
          <button
            className="button button-primary"
            disabled={cartAdded || cartBusy}
            onClick={async () => {
              if (!cartPreview || cartBusy) return;
              setCartBusy(true);
              try {
                await addToDemoCart(cartPreview);
                setCartAdded(true);
                setStatus("Демо-конфигурация добавлена в локальную корзину.");
              } catch (reason) {
                setError(errorText(reason));
                cartDialog.current?.close();
              } finally {
                setCartBusy(false);
              }
            }}
          >
            {cartAdded
              ? "Добавлено ✓"
              : cartBusy
                ? "Добавляем…"
                : "Добавить в демо-корзину"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
