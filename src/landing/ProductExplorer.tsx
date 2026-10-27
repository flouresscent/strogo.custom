import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "./product-explorer.css";

const features = [
  {
    id: "colors",
    title: "Цвета",
    description:
      "Найди свой оттенок. Фон остаётся частью композиции — под изображением и вокруг него.",
  },
  {
    id: "sizes",
    title: "Два размера",
    description:
      "Место для всего сетапа. Или только для твоих движений. Оба формата показаны в одной шкале.",
  },
  {
    id: "design",
    title: "Свой дизайн",
    description:
      "От спокойных линий до целого пейзажа. Выбери настроение — своё изображение добавишь в конструкторе.",
  },
  {
    id: "text",
    title: "Надпись",
    description:
      "Имя, мысль или несколько слов, которые задают настроение. Попробуй написать что-то своё.",
  },
  {
    id: "desk",
    title: "На твоём столе",
    description:
      "Посмотри на дизайн в окружении привычных вещей. Эта сцена — пример, а не точный результат печати.",
  },
] as const;

type FeatureId = (typeof features)[number]["id"];

const colors = [
  { name: "Графит", value: "#414347", light: false },
  { name: "Мел", value: "#d5d2c8", light: true },
  { name: "Тёплый серый", value: "#8c7f73", light: true },
  { name: "Дымка", value: "#7b8c90", light: true },
];

const designs = [
  { name: "Contour", source: "/assets/contour.svg" },
  { name: "Orbit", source: "/assets/orbit.svg" },
  { name: "Mono", source: "/assets/mono.svg" },
  { name: "Пейзаж", source: "/assets/custom-landscape.png" },
];

interface ExplorerSettings {
  color: number;
  design: number;
  compact: boolean;
  text: string;
  darkText: boolean;
  showProps: boolean;
}

function Icon({ kind }: { kind: "plus" | "close" | "up" | "down" | "arrow" }) {
  const path = {
    plus: "M5 10h10M10 5v10",
    close: "m5 5 10 10M15 5 5 15",
    up: "m5 12 5-5 5 5",
    down: "m5 8 5 5 5-5",
    arrow: "M4 10h12m-5-5 5 5-5 5",
  }[kind];
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RugShape({
  compact,
  active,
  feature,
  settings,
}: {
  compact: boolean;
  active: boolean;
  feature: FeatureId;
  settings: ExplorerSettings;
}) {
  return (
    <div
      className={`pe-rug-shape ${compact ? "pe-rug-compact" : "pe-rug-wide"}${active ? " pe-rug-active" : ""}${colors[settings.color].light ? " pe-rug-light" : ""}`}
      aria-hidden="true"
    >
      {colors.map((color, index) => (
        <span
          key={color.name}
          className={`pe-color-layer${index === settings.color ? " pe-layer-active" : ""}`}
          style={{ backgroundColor: color.value }}
        />
      ))}
      <span className="pe-rug-wordmark">
        STROGO<span>CUSTOM / YOUR CANVAS</span>
      </span>
      <div className="pe-artwork-frame">
        {designs.map((design, index) => (
          <img
            key={design.name}
            className={`pe-artwork-image${index === settings.design ? " pe-layer-active" : ""}`}
            src={design.source}
            alt=""
            draggable="false"
            loading="lazy"
          />
        ))}
      </div>
      <span
        className={`pe-custom-text${feature === "text" ? " pe-custom-text-visible" : ""}`}
        style={{ color: settings.darkText ? "#171719" : "#f5f5f7" }}
      >
        {settings.text}
      </span>
      <span className="pe-stitching" />
    </div>
  );
}

function ProductView({
  feature,
  settings,
  immersive = false,
}: {
  feature: FeatureId;
  settings: ExplorerSettings;
  immersive?: boolean;
}) {
  return (
    <div
      className={`pe-product-stage pe-view-${feature}${settings.compact ? " pe-size-compact" : ""}${settings.showProps ? " pe-props-enabled" : ""}${immersive ? " pe-stage-immersive" : ""}`}
      role="img"
      aria-label={`Визуализация коврика: ${colors[settings.color].name}, ${settings.compact ? "49 на 42" : "90 на 40"} сантиметров, дизайн ${designs[settings.design].name}${feature === "text" && settings.text ? `, надпись «${settings.text}»` : ""}${feature === "desk" && settings.showProps ? ", с клавиатурой и мышью" : ""}`}
    >
      <div className="pe-product-composition">
        <div className="pe-table-surface" aria-hidden="true" />
        <div
          className="pe-size-outline pe-size-outline-wide"
          aria-hidden="true"
        >
          <span>90 × 40 см</span>
        </div>
        <div
          className="pe-size-outline pe-size-outline-compact"
          aria-hidden="true"
        >
          <span>49 × 42 см</span>
        </div>
        <RugShape
          compact={false}
          active={!settings.compact}
          feature={feature}
          settings={settings}
        />
        <RugShape
          compact
          active={settings.compact}
          feature={feature}
          settings={settings}
        />
        <div className="pe-desk-props" aria-hidden="true">
          <div className="pe-keyboard">
            {Array.from({ length: 60 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="pe-mouse">
            <span />
          </div>
        </div>
      </div>
      <span className="pe-product-caption" aria-hidden="true">
        {colors[settings.color].name}
        <span>·</span>
        {settings.compact ? "49 × 42 см" : "90 × 40 см"}
      </span>
    </div>
  );
}

function FeatureControls({
  feature,
  settings,
  onChange,
  id,
}: {
  feature: FeatureId;
  settings: ExplorerSettings;
  onChange: (patch: Partial<ExplorerSettings>) => void;
  id: string;
}) {
  switch (feature) {
    case "colors":
      return (
        <>
          <div
            className="pe-color-options"
            role="group"
            aria-label="Цвет фона коврика"
          >
            {colors.map((color, index) => (
              <button
                key={color.name}
                type="button"
                className="pe-color-option"
                aria-label={color.name}
                aria-pressed={index === settings.color}
                onClick={() => onChange({ color: index })}
              >
                <span style={{ backgroundColor: color.value }} />
              </button>
            ))}
          </div>
          <p className="pe-choice-label" aria-live="polite">
            {colors[settings.color].name}
          </p>
        </>
      );
    case "sizes":
      return (
        <>
          <div
            className="pe-size-options"
            role="group"
            aria-label="Размер коврика"
          >
            <button
              type="button"
              aria-pressed={!settings.compact}
              onClick={() => onChange({ compact: false })}
            >
              90 × 40 см
            </button>
            <button
              type="button"
              aria-pressed={settings.compact}
              onClick={() => onChange({ compact: true })}
            >
              49 × 42 см
            </button>
          </div>
          <p className="pe-choice-label">
            {settings.compact
              ? "Компактный формат для мыши."
              : "Большой формат для всего сетапа."}
          </p>
        </>
      );
    case "design":
      return (
        <div
          className="pe-design-options"
          role="group"
          aria-label="Пример дизайна"
        >
          {designs.map((design, index) => (
            <button
              key={design.name}
              type="button"
              aria-pressed={index === settings.design}
              onClick={() => onChange({ design: index })}
            >
              <img src={design.source} alt="" />
              {design.name}
            </button>
          ))}
        </div>
      );
    case "text":
      return (
        <div className="pe-text-controls">
          <label htmlFor={`${id}-text`}>Твоя надпись</label>
          <input
            id={`${id}-text`}
            value={settings.text}
            maxLength={28}
            placeholder="Например, PLAY YOUR WAY."
            onChange={(event) => onChange({ text: event.target.value })}
          />
          <div className="pe-text-tones" role="group" aria-label="Цвет надписи">
            <button
              type="button"
              aria-pressed={!settings.darkText}
              onClick={() => onChange({ darkText: false })}
            >
              <span />
              Светлая
            </button>
            <button
              type="button"
              aria-pressed={settings.darkText}
              onClick={() => onChange({ darkText: true })}
            >
              <span />
              Тёмная
            </button>
          </div>
        </div>
      );
    case "desk":
      return (
        <label className="pe-props-toggle">
          <input
            type="checkbox"
            checked={settings.showProps}
            onChange={(event) => onChange({ showProps: event.target.checked })}
          />
          <span>Показать клавиатуру и мышь</span>
        </label>
      );
  }
}

interface FeatureMenuProps {
  activeIndex: number;
  isOpen: boolean;
  settings: ExplorerSettings;
  onSelect: (index: number) => void;
  onChange: (patch: Partial<ExplorerSettings>) => void;
  id: string;
}

interface DisclosureBounds {
  width: number;
  height: number;
  background: string;
}

function measureDisclosures(list: HTMLDivElement | null) {
  const measurements = new Map<number, DisclosureBounds>();
  list
    ?.querySelectorAll<HTMLElement>("[data-feature-index]")
    .forEach((entry) => {
      const rect = entry.getBoundingClientRect();
      measurements.set(Number(entry.dataset.featureIndex), {
        width: rect.width,
        height: rect.height,
        background: getComputedStyle(entry).backgroundColor,
      });
    });
  return measurements;
}

function useDisclosureMorph(activeIndex: number, isOpen: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const beforeSelection = useRef(new Map<number, DisclosureBounds>());
  const previousIndex = useRef<number | null>(null);

  useLayoutEffect(() => {
    const oldIndex = previousIndex.current;
    previousIndex.current = isOpen ? activeIndex : null;
    const from = beforeSelection.current;
    beforeSelection.current = new Map();
    const list = listRef.current;
    if (
      !list ||
      !isOpen ||
      oldIndex === null ||
      oldIndex === activeIndex ||
      !window.matchMedia("(min-width: 761px)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const to = measureDisclosures(list);
    const cleanups: (() => void)[] = [];
    for (const index of [oldIndex, activeIndex]) {
      const entry = list.querySelector<HTMLElement>(
        `[data-feature-index="${index}"]`,
      );
      const start = from.get(index);
      const end = to.get(index);
      if (
        !entry ||
        !start ||
        !end ||
        !start.width ||
        !end.width ||
        typeof entry.animate !== "function"
      )
        continue;

      const oldOverflow = entry.style.overflow;
      const oldBackground = entry.style.backgroundColor;
      entry.style.overflow = "hidden";
      // Keep the new content at its final line length while its shell unfolds.
      entry.style.setProperty("--pe-morph-card-width", `${end.width}px`);
      if (index === oldIndex) entry.style.backgroundColor = start.background;
      const animation = entry.animate(
        [
          { width: `${start.width}px`, height: `${start.height}px` },
          { width: `${end.width}px`, height: `${end.height}px` },
        ],
        { duration: 520, easing: "cubic-bezier(.22, 1, .36, 1)" },
      );
      let cleaned = false;
      function restoreStyles() {
        if (cleaned || !entry) return;
        cleaned = true;
        entry.style.overflow = oldOverflow;
        entry.style.backgroundColor = oldBackground;
        entry.style.removeProperty("--pe-morph-card-width");
      }
      void animation.finished.then(restoreStyles, restoreStyles);
      cleanups.push(() => {
        animation.cancel();
        restoreStyles();
      });
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [activeIndex, isOpen]);

  return {
    listRef,
    captureBeforeSelection: () => {
      // One measurement per click also makes interrupted transitions continuous.
      beforeSelection.current = measureDisclosures(listRef.current);
    },
  };
}

function FeatureMenu({
  activeIndex,
  isOpen,
  settings,
  onSelect,
  onChange,
  id,
}: FeatureMenuProps) {
  const { listRef, captureBeforeSelection } = useDisclosureMorph(
    activeIndex,
    isOpen,
  );

  function selectFeature(index: number) {
    if (index === activeIndex) return;
    captureBeforeSelection();
    onSelect(index);
  }

  return (
    <div className="pe-feature-menu">
      <div
        className="pe-mobile-feature-nav"
        role="group"
        aria-label="Возможности коврика"
      >
        {features.map((feature, index) => (
          <button
            key={feature.id}
            type="button"
            aria-pressed={index === activeIndex}
            onClick={() => selectFeature(index)}
          >
            {feature.title}
          </button>
        ))}
      </div>
      <div className="pe-feature-list" ref={listRef}>
        {features.map((feature, index) => (
          <div
            key={feature.id}
            data-feature-index={index}
            className={`pe-feature-entry${index === activeIndex ? " pe-feature-active" : ""}`}
          >
            <button
              type="button"
              className="pe-feature-toggle"
              aria-expanded={index === activeIndex}
              aria-controls={
                index === activeIndex ? `${id}-controls` : undefined
              }
              onClick={() => selectFeature(index)}
            >
              <span>{feature.title}</span>
              {index !== activeIndex && (
                <span className="pe-pill-plus">
                  <Icon kind="plus" />
                </span>
              )}
            </button>
            {index === activeIndex && (
              <div
                className="pe-feature-card"
                id={`${id}-controls`}
                key={feature.id}
              >
                <p>
                  <strong>{feature.title}.</strong> {feature.description}
                </p>
                <FeatureControls
                  feature={feature.id}
                  settings={settings}
                  onChange={onChange}
                  id={id}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="pe-feature-navigation">
        <div className="pe-cycle-buttons">
          <button
            type="button"
            aria-label="Предыдущая возможность"
            onClick={() =>
              selectFeature(
                (activeIndex + features.length - 1) % features.length,
              )
            }
          >
            <Icon kind="up" />
          </button>
          <button
            type="button"
            aria-label="Следующая возможность"
            onClick={() => selectFeature((activeIndex + 1) % features.length)}
          >
            <Icon kind="down" />
          </button>
        </div>
        <span aria-live="polite">
          0{activeIndex + 1}
          <i aria-hidden="true"> / </i>0{features.length}
        </span>
      </div>
    </div>
  );
}

export default function ProductExplorer() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [settings, setSettings] = useState<ExplorerSettings>({
    color: 0,
    design: 3,
    compact: false,
    text: "PLAY YOUR WAY.",
    darkText: false,
    showProps: true,
  });
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const activeFeature = features[activeIndex];

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function openExplorer(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setActiveIndex(index);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      setIsOpen(true);
    }
  }

  function onDialogClose() {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function changeSettings(patch: Partial<ExplorerSettings>) {
    setSettings((previous) => ({ ...previous, ...patch }));
  }

  return (
    <div className="pe-explorer">
      <div className="pe-inline-panel">
        <div className="pe-inline-menu">
          <p className="pe-inline-intro">
            Присмотрись.
            <br />
            <span>Здесь всё — про тебя.</span>
          </p>
          <div
            className="pe-inline-features"
            role="group"
            aria-label="Рассмотреть возможности коврика"
          >
            {features.map((feature, index) => (
              <button
                key={feature.id}
                type="button"
                aria-haspopup="dialog"
                onClick={(event) => openExplorer(index, event.currentTarget)}
              >
                <span>{feature.title}</span>
                <span className="pe-pill-plus">
                  <Icon kind="plus" />
                </span>
              </button>
            ))}
          </div>
        </div>
        <ProductView feature={activeFeature.id} settings={settings} />
      </div>
      <p className="pe-inline-note">
        Выбери деталь, чтобы рассмотреть её ближе.
      </p>
      <dialog
        ref={dialogRef}
        className="pe-dialog"
        aria-labelledby={`${id}-title`}
        onClose={onDialogClose}
      >
        <div className="pe-dialog-scroll">
          <header className="pe-dialog-header">
            <h2 id={`${id}-title`}>Твой коврик. В деталях.</h2>
            <button
              type="button"
              className="pe-close"
              aria-label="Закрыть обзор коврика"
              onClick={() => dialogRef.current?.close()}
              autoFocus
            >
              <Icon kind="close" />
            </button>
          </header>
          <div className="pe-dialog-content">
            <FeatureMenu
              activeIndex={activeIndex}
              isOpen={isOpen}
              settings={settings}
              onSelect={setActiveIndex}
              onChange={changeSettings}
              id={id}
            />
            <ProductView
              feature={activeFeature.id}
              settings={settings}
              immersive
            />
          </div>
          <footer className="pe-dialog-footer">
            <p>Пример возможностей. Форматы и параметры изделия — концепция.</p>
            <a href="/custom/create" className="pl-button pl-button-primary">
              Создать свой коврик <Icon kind="arrow" />
            </a>
          </footer>
        </div>
      </dialog>
    </div>
  );
}
