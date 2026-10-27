import { useState } from "react";
import Landing from "./landing/Landing";
import Editor from "./editor/Editor";

const links = [
  [
    "Новая коллекция",
    "https://strogo.shop/catalog?tfc_storepartnav%5B2985782801%5D=377708019663&tfc_div=:::",
  ],
  ["Премиум ковры", "https://strogo.shop/darkness"],
  ["Custom", "/custom"],
  ["Поддержка", "https://t.me/strogoMagaz"],
];
export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const editor =
    window.location.pathname.replace(/\/$/, "") === "/custom/create";
  if (!editor) return <Landing />;
  return (
    <>
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header className="site-header">
        <a
          href="https://strogo.shop/"
          className="brand"
          aria-label="Strogo Shop — основной магазин"
        >
          <img src="/assets/strogo-logo.png" alt="Strogo" />
        </a>
        <nav
          className={menuOpen ? "site-nav is-open" : "site-nav"}
          aria-label="Главная навигация"
          id="site-navigation"
        >
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              aria-current={label === "Custom" ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {label}
              {label === "Custom" && <span className="nav-new">NEW</span>}
            </a>
          ))}
        </nav>
        <span className="header-prototype">КОНЦЕПТ / 01</span>
        <button
          className="menu-toggle"
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          aria-controls="site-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "×" : "☰"}
        </button>
      </header>
      <main id="main">
        <Editor />
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <a className="footer-wordmark" href="https://strogo.shop/">
            STROGO<span>SHOP</span>
          </a>
          <p>Твоя игра. Твои правила.</p>
          <a href="https://t.me/strogoMagaz">Связаться с нами ↗</a>
        </div>
        <div className="footer-bottom">
          <span>
            STROGO CUSTOM © {new Date().getFullYear()} · Демонстрационный
            прототип
          </span>
          <div>
            <a href="https://strogo.shop/return">Условия возврата</a>
            <a href="https://strogo.shop/public">Публичная оферта</a>
            <a href="https://strogo.shop/privacy">Конфиденциальность</a>
          </div>
        </div>
        <p className="footer-note">
          Документы относятся к основному магазину. Условия кастомных изделий
          требуют отдельного согласования.
        </p>
      </footer>
    </>
  );
}
