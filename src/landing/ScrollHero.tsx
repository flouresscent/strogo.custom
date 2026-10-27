import { useEffect, useRef } from "react";
import { assetUrl } from "../shared/urls";

// Identical cells and mirrored neighbours keep the centre mat fixed at row/column centre.
const designs = [
  "orbit",
  "bloom",
  "mono",
  "bloom",
  "orbit",
  "tide",
  "contour",
  "landscape",
  "contour",
  "tide",
  "mono",
  "orbit",
  "tide",
  "orbit",
  "mono",
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const quad = (n: number) =>
  n < 0.5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
type ViewTimelineConstructor = new (options: {
  subject: Element;
  axis: string;
}) => AnimationTimeline;
type RangeOptions = KeyframeAnimationOptions & {
  rangeStart: string;
  rangeEnd: string;
};

export default function ScrollHero() {
  const section = useRef<HTMLElement>(null);
  const mosaic = useRef<HTMLDivElement>(null);
  const closeup = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLParagraphElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const ending = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = section.current;
    const grid = mosaic.current;
    if (!root || !grid) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const Timeline = (
      window as unknown as { ViewTimeline?: ViewTimelineConstructor }
    ).ViewTimeline;
    const native =
      !!Timeline && CSS.supports("animation-range: contain 0% contain 100%");
    let animations: Animation[] = [];
    let frame = 0;
    let geometry = {
      top: 0,
      travel: 1,
      height: 1,
      start: 1,
      end: 1,
      tileWidth: 1,
    };
    const scale = (p: number) =>
      geometry.start * Math.pow(geometry.end / geometry.start, quad(clamp(p)));
    const transform = (p: number) =>
      `translate3d(-50%, -50%, 0) scale(${scale(p)})`;
    // A separate 1800px surface keeps the first-screen photo sharp. The large grid
    // can be cached at tile resolution, then takes over once the camera is farther out.
    const detailTransform = (p: number) =>
      `translate3d(-50%, -50%, 0) scale(${(geometry.tileWidth * scale(p)) / 1800})`;
    const detailOpacity = (p: number) => clamp((scale(p) - 1.9) / 0.6);
    const opacity = (node: HTMLElement | null, value: number) => {
      if (node) node.style.opacity = String(clamp(value));
    };

    const paintFallback = () => {
      frame = 0;
      if (motion.matches || native) return;
      const scroll = window.scrollY - geometry.top;
      const progress = clamp(scroll / geometry.travel);
      grid.style.transform = transform(progress);
      if (closeup.current)
        closeup.current.style.transform = detailTransform(progress);
      opacity(closeup.current, detailOpacity(progress));
      opacity(headline.current, 1 - scroll / (geometry.height * 0.27));
      opacity(
        copy.current,
        1 - (scroll - geometry.height * 0.04) / (geometry.height * 0.29),
      );
      opacity(
        shade.current,
        0.5 *
          (1 -
            clamp((scroll - geometry.height * 0.2) / (geometry.height * 0.35))),
      );
      opacity(hint.current, 1 - scroll / (geometry.height * 0.12));
      opacity(ending.current, (progress - 0.84) / 0.14);
    };
    const scheduleFallback = () => {
      if (!frame && !native && !motion.matches)
        frame = requestAnimationFrame(paintFallback);
    };
    const update = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      cancelAnimationFrame(frame);
      frame = 0;
      for (const node of [
        grid,
        closeup.current,
        headline.current,
        copy.current,
        shade.current,
        hint.current,
        ending.current,
      ]) {
        node?.style.removeProperty("transform");
        node?.style.removeProperty("opacity");
      }
      if (motion.matches) {
        root.dataset.animationEngine = "static";
        return;
      }
      // Geometry is measured only on resize. Scrolling never reads layout or changes inherited vars.
      const height = root.firstElementChild?.clientHeight || innerHeight;
      const tile = grid.querySelector<HTMLElement>(".pl-hero-mat")!;
      geometry = {
        top: root.getBoundingClientRect().top + scrollY,
        travel: Math.max(1, root.offsetHeight - height),
        height,
        start:
          Math.max(innerWidth / tile.offsetWidth, height / tile.offsetHeight) *
          1.08,
        end: innerWidth < 600 ? 0.88 : 1,
        tileWidth: tile.offsetWidth,
      };
      if (!native || !Timeline) {
        root.dataset.animationEngine = "raf";
        paintFallback();
        return;
      }
      root.dataset.animationEngine = "view-timeline";
      const timeline = new Timeline({ subject: root, axis: "block" });
      const attach = (node: HTMLElement | null, keyframes: Keyframe[]) => {
        if (node)
          animations.push(
            node.animate(keyframes, {
              timeline,
              duration: "auto",
              fill: "both",
              easing: "linear",
              rangeStart: "contain 0%",
              rangeEnd: "contain 100%",
            } as RangeOptions),
          );
      };
      attach(
        grid,
        Array.from({ length: 61 }, (_, i) => ({
          offset: i / 60,
          transform: transform(i / 60),
        })),
      );
      attach(
        closeup.current,
        Array.from({ length: 61 }, (_, i) => ({
          offset: i / 60,
          transform: detailTransform(i / 60),
          opacity: detailOpacity(i / 60),
        })),
      );
      const vhOffset = (vh: number) =>
        clamp((geometry.height * vh) / geometry.travel);
      attach(headline.current, [
        { opacity: 1, offset: 0 },
        { opacity: 0, offset: vhOffset(0.27) },
        { opacity: 0, offset: 1 },
      ]);
      attach(copy.current, [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: vhOffset(0.04) },
        { opacity: 0, offset: vhOffset(0.33) },
        { opacity: 0, offset: 1 },
      ]);
      attach(shade.current, [
        { opacity: 0.5, offset: 0 },
        { opacity: 0.5, offset: vhOffset(0.2) },
        { opacity: 0, offset: vhOffset(0.55) },
        { opacity: 0, offset: 1 },
      ]);
      attach(hint.current, [
        { opacity: 1, offset: 0 },
        { opacity: 0, offset: vhOffset(0.12) },
        { opacity: 0, offset: 1 },
      ]);
      attach(ending.current, [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.84 },
        { opacity: 1, offset: 0.98 },
        { opacity: 1, offset: 1 },
      ]);
    };
    const resize = new ResizeObserver(update);
    resize.observe(root);
    const visibility = new IntersectionObserver(([entry]) => {
      grid.style.willChange =
        entry.isIntersecting && !motion.matches ? "transform" : "auto";
    });
    visibility.observe(root);
    motion.addEventListener("change", update);
    window.addEventListener("scroll", scheduleFallback, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      resize.disconnect();
      visibility.disconnect();
      motion.removeEventListener("change", update);
      window.removeEventListener("scroll", scheduleFallback);
    };
  }, []);

  return (
    <section
      ref={section}
      className="pl-scroll-hero"
      id="overview"
      aria-labelledby="pl-hero-title"
    >
      <div className="pl-hero-sticky">
        <div className="pl-mosaic" ref={mosaic} aria-hidden="true">
          {designs.map((design, index) => (
            <div
              key={index}
              className={`pl-hero-mat${index === 7 ? " is-main" : ""}`}
            >
              <img
                src={assetUrl(`/assets/hero-${design}.webp`)}
                alt=""
                fetchPriority={index === 7 ? "high" : "auto"}
                decoding="async"
              />
              <span className="pl-mat-brand">strogo</span>
            </div>
          ))}
        </div>
        <div className="pl-hero-closeup" ref={closeup} aria-hidden="true">
          <img
            src={assetUrl("/assets/hero-landscape.webp")}
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="pl-hero-shade" ref={shade} aria-hidden="true" />
        <div className="pl-hero-copy">
          <div className="pl-hero-title-block" ref={headline}>
            <p className="pl-hero-eyebrow">STROGO CUSTOM</p>
            <h1 id="pl-hero-title">
              Твоя игра.
              <br />
              Твои правила.
            </h1>
          </div>
          <p className="pl-hero-description" ref={copy}>
            Теперь твой дизайн — на твоём коврике.
            <br className="pl-desktop-break" /> Загрузи любимое изображение,
            выбери размер
            <br className="pl-desktop-break" /> и создай что-то по-настоящему
            своё.
          </p>
        </div>
        <div className="pl-scroll-hint" ref={hint} aria-hidden="true">
          <span>Листай. Здесь начинается твоё.</span>
          <i>↓</i>
        </div>
        <div className="pl-hero-end" ref={ending} aria-hidden="true">
          <span>Твой коврик.</span> Каким ты его видишь.
        </div>
      </div>
    </section>
  );
}
