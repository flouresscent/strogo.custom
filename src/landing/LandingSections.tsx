import ProductExplorer from "./ProductExplorer";
import { appUrl, assetUrl } from "../shared/urls";
import "./sections.css";

const questions = [
  {
    title: "Можно ли загрузить любую картинку?",
    answer:
      "Конструктор поддерживает PNG, JPG и WebP. Загрузи своё изображение или материалы, на использование которых у тебя есть разрешение. Файлы обрабатываются на твоём устройстве и не отправляются на сервер.",
  },
  {
    title: "Какое разрешение изображения необходимо?",
    answer:
      "Это зависит от размера изображения на коврике. Конструктор учитывает масштаб и показывает ориентировочную чёткость. Предварительный ориентир — 150 DPI; окончательные требования к печати определит производитель.",
  },
  {
    title: "Можно ли изменить дизайн после сохранения?",
    answer:
      "Да. Сохрани проект в конструкторе и открой его снова на том же устройстве. Изображение, текст и настройки останутся доступными для редактирования. Сохранение локальное: очистка данных браузера удалит проект.",
  },
  {
    title: "Какие размеры доступны?",
    answer:
      "В прототипе доступны два формата: 90 × 40 см для клавиатуры и мыши и 49 × 42 см для более компактного пространства. Размеры и материалы будущей модели ещё предстоит согласовать.",
  },
  {
    title: "Можно ли посмотреть результат до заказа?",
    answer:
      "Конечно. В конструкторе есть плоский вид для точного размещения и сцена на столе для примерки дизайна. Превью приблизительное и не гарантирует точное воспроизведение цвета. Корзина работает в демонстрационном режиме — без заказа и оплаты.",
  },
];

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M4 10h12m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Product({
  design,
  compact = false,
  className = "",
}: {
  design: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`pl-pad${compact ? " pl-pad-compact" : ""}${className ? ` ${className}` : ""}`}
    >
      <img
        src={assetUrl(`/assets/${design}.svg`)}
        alt=""
        draggable="false"
        loading="lazy"
      />
      <span className="pl-pad-seam" aria-hidden="true" />
      <span className="pl-pad-signature" aria-hidden="true">
        strogo
      </span>
    </div>
  );
}

function MiniKeyboard() {
  return (
    <div className="pl-mini-keyboard" aria-hidden="true">
      {Array.from({ length: 45 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

export default function LandingSections() {
  return (
    <>
      <section
        className="pl-possibilities pl-content-section"
        id="possibilities"
        aria-labelledby="pl-possibilities-title"
      >
        <div className="pl-section-heading">
          <span className="pl-section-kicker">
            Немного тебя. В каждой детали.
          </span>
          <h2 id="pl-possibilities-title">
            Создан тобой.
            <br />
            <span>Подстроен под тебя.</span>
          </h2>
          <p>
            Любимая фотография, своя графика или всего несколько слов.
            <br className="pl-desktop-break" /> Собери дизайн, который хочется
            видеть каждый день.
          </p>
        </div>

        <ProductExplorer />
      </section>

      <section
        className="pl-process pl-content-section"
        id="how-it-works"
        aria-labelledby="pl-process-title"
      >
        <div className="pl-section-heading pl-section-heading-short">
          <span className="pl-section-kicker">
            От первой идеи до последней детали.
          </span>
          <h2 id="pl-process-title">
            Всё начинается
            <br />с трёх простых шагов.
          </h2>
        </div>
        <div className="pl-process-grid">
          <article className="pl-process-step">
            <div className="pl-step-scene pl-step-size" aria-hidden="true">
              <div className="pl-step-size-wide" />
              <div className="pl-step-size-compact" />
              <span className="pl-scene-size-label pl-scene-size-label-wide">
                90 × 40
              </span>
              <span className="pl-scene-size-label pl-scene-size-label-compact">
                49 × 42
              </span>
            </div>
            <div className="pl-step-copy">
              <span className="pl-step-number">01</span>
              <h3>Найди свой формат.</h3>
              <p>
                Больше места для всего сетапа.
                <br />
                Или только для твоих движений.
              </p>
            </div>
          </article>
          <article className="pl-process-step">
            <div className="pl-step-scene pl-step-art" aria-hidden="true">
              <Product design="orbit" />
              <div className="pl-step-selection">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="pl-step-cursor">
                <svg width="23" height="29" viewBox="0 0 23 29" fill="none">
                  <path
                    d="M2 2v22l5-6 5 9 4-2-5-9h9L2 2Z"
                    fill="white"
                    stroke="#6d6381"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <div className="pl-step-copy">
              <span className="pl-step-number">02</span>
              <h3>Добавь что-то своё.</h3>
              <p>
                Загрузи картинку. Подбери масштаб.
                <br />
                Добавь цвет и пару слов.
              </p>
            </div>
          </article>
          <article className="pl-process-step">
            <div className="pl-step-scene pl-step-desk" aria-hidden="true">
              <Product design="contour" />
              <MiniKeyboard />
              <span className="pl-mini-mouse" />
            </div>
            <div className="pl-step-copy">
              <span className="pl-step-number">03</span>
              <h3>Посмотри, как вместе.</h3>
              <p>
                Примерь коврик на стол.
                <br />
                Сохрани дизайн и скачай превью.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section
        className="pl-sizes-section"
        id="sizes"
        aria-labelledby="pl-sizes-title"
      >
        <div className="pl-sizes-inner">
          <div className="pl-section-heading">
            <span className="pl-section-kicker">
              Место для того, что важно.
            </span>
            <h2 id="pl-sizes-title">
              Два размера.
              <br />
              <span>Твоё пространство.</span>
            </h2>
            <p>Выбери поверхность, с которой всё встанет на свои места.</p>
          </div>
          <div className="pl-format-comparison">
            <article className="pl-format-card pl-format-card-wide">
              <div className="pl-format-surface">
                <Product design="contour" />
              </div>
              <div className="pl-format-copy">
                <h3>
                  90 × 40 <small>см</small>
                </h3>
                <p>
                  Для клавиатуры, мыши
                  <br />и полной свободы.
                </p>
              </div>
            </article>
            <article className="pl-format-card pl-format-card-compact">
              <div className="pl-format-surface">
                <Product design="mono" compact />
              </div>
              <div className="pl-format-copy">
                <h3>
                  49 × 42 <small>см</small>
                </h3>
                <p>
                  Для точных движений
                  <br />и компактного стола.
                </p>
              </div>
            </article>
          </div>
          <div className="pl-material-details">
            <span>Тканевая поверхность</span>
            <i aria-hidden="true" />
            <span>Мягкое основание</span>
            <i aria-hidden="true" />
            <span>Прошитые края</span>
          </div>
          <p className="pl-prototype-note">
            Концепция изделия. Форматы, материалы и параметры печати требуют
            согласования с производителем.
          </p>
        </div>
      </section>

      <section
        className="pl-faq pl-content-section"
        id="faq"
        aria-labelledby="pl-faq-title"
      >
        <div className="pl-section-heading pl-section-heading-short">
          <span className="pl-section-kicker">Хорошо знать заранее.</span>
          <h2 id="pl-faq-title">Ещё пара деталей.</h2>
        </div>
        <div className="pl-faq-list">
          {questions.map((question) => (
            <details key={question.title}>
              <summary>
                {question.title}
                <span className="pl-faq-toggle" aria-hidden="true">
                  <i />
                  <i />
                </span>
              </summary>
              <p>{question.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pl-final-section" aria-labelledby="pl-final-title">
        <div className="pl-final-content">
          <span className="pl-section-kicker">Осталось добавить тебя.</span>
          <h2 id="pl-final-title">
            Твоё пространство.
            <br />
            <span>Твой дизайн.</span>
          </h2>
          <p>Начни с картинки. Или просто с идеи.</p>
          <a
            className="pl-button pl-button-primary"
            href={appUrl("/custom/create")}
          >
            Открыть конструктор <Arrow />
          </a>
        </div>
        <div className="pl-final-products" aria-hidden="true">
          <Product design="mono" className="pl-final-pad-back" />
          <Product design="orbit" className="pl-final-pad-front" />
        </div>
      </section>
    </>
  );
}
