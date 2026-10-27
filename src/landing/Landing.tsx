import { useEffect, useRef, useState } from "react";
import ScrollHero from "./ScrollHero";
import LandingSections from "./LandingSections";
import { appUrl } from "../shared/urls";
import "./landing.css";

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return (
    <div className="premium-landing pl-theme-dark">
      <a className="pl-skip" href="#main">
        К содержимому
      </a>
      <header className="pl-header">
        <div className="pl-nav-shell">
          <a
            href={appUrl("/custom")}
            className="pl-wordmark"
            aria-label="Strogo Custom — главная"
          >
            Strogo<span>Custom</span>
          </a>
          <nav
            id="custom-navigation"
            className={menuOpen ? "pl-navigation is-open" : "pl-navigation"}
            aria-label="Навигация Strogo Custom"
          >
            <a href="#overview" onClick={() => setMenuOpen(false)}>
              Обзор
            </a>
            <a href="#possibilities" onClick={() => setMenuOpen(false)}>
              Возможности
            </a>
            <a href="#sizes" onClick={() => setMenuOpen(false)}>
              Размеры
            </a>
          </nav>
          <div className="pl-nav-actions">
            <a
              className="pl-button pl-button-primary pl-header-cta"
              aria-label="Создать свой коврик"
              href={appUrl("/custom/create")}
            >
              Создать
            </a>
            <button
              ref={menuButton}
              className="pl-menu"
              aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={menuOpen}
              aria-controls="custom-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className={menuOpen ? "is-open" : ""} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <ScrollHero />
        <LandingSections />
      </main>
      <footer className="pl-footer">
        <div className="pl-footer-top">
          <a href={appUrl("/custom")} className="pl-wordmark">
            Strogo<span>Custom</span>
          </a>
          <p>Всё начинается с твоей идеи.</p>
          <a href="https://t.me/strogoMagaz">
            Написать нам <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="pl-footer-bottom">
          <span>© {new Date().getFullYear()} Strogo Custom</span>
          <a href="https://strogo.shop/">Перейти в Strogo Shop ↗</a>
          <span>Концепт индивидуальных ковриков</span>
        </div>
        <p className="pl-footer-note">
          Демонстрационный прототип. Стоимость, материалы и условия производства
          уточняются. Настоящие заказы и оплата пока недоступны.
        </p>
      </footer>
    </div>
  );
}
