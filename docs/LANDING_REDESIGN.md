# Лендинг Strogo Custom — мягкое премиальное направление

Дата: 27 октября 2026 года.

Прямой запрос пользователя меняет предыдущий ориентир на точное воспроизведение магазина: лендинг теперь представляет самостоятельное направление с эстетикой Apple. Референсы — предоставленные скриншоты и https://www.apple.com/apple-homeview/ (страница просмотрена через веб-инструмент). Материалы Apple не скопированы в приложение.

## Реализация

- `/custom` и `/` получают отдельную оболочку, навигацию и футер. У конструктора `/custom/create` сохранены существующие оболочка, стили и функциональность.
- Собственная плавающая шапка: Strogo Custom, якоря разделов, переход к созданию. На мобильном — раскрываемая навигация с закрытием по Escape.
- Первый экран: оригинальный пейзажный принт во весь экран, заголовок «Твоя игра. Твои правила.» и короткое описание функции.
- При обычной прокрутке текст плавно исчезает, центральный коврик отдаляется, раскрывая композицию из 15 ковриков с шестью вариантами изображений. Прокрутка вверх воспроизводит переход обратно. Прокрутка страницы не перехватывается.
- Для анимации используются CSS transform/opacity и один requestAnimationFrame на обновление. ResizeObserver учитывает изменение размеров. Все обработчики снимаются при выходе со страницы.
- `prefers-reduced-motion: reduce`: статичная композиция, обычный поток контента, читаемый заголовок без исчезновения.
- Дальнейшие блоки: спокойная бело-серая палитра, системная типографика, крупные изображения, примеры/форматы с переключением, три шага, FAQ и финальный переход в конструктор.

## Изменённые области

`src/App.tsx`, `src/landing/Landing.tsx`, `src/landing/ScrollHero.tsx`, `src/landing/landing.css`, `src/landing/LandingSections.tsx`, `src/landing/sections.css`; тесты лендинга и новые локальные assets. Модель печати и пользовательские проекты не менялись.

## Новые изображения

- `public/assets/custom-landscape.png`: создано встроенным инструментом `image_gen` и скопировано в проект. Оригинальная генерация, не фотография реального товара и не подтверждение фактической печати.
- `public/assets/custom-bloom.svg`, `public/assets/custom-tide.svg`: оригинальная локальная векторная графика для композиции. Старые принты сохранены.

Промпт изображения (встроенный режим, без внешнего API/CLI):

> Use case: photorealistic-natural. Asset type: an original panoramic artwork to be printed edge-to-edge on a premium gaming desk mat, also shown as a large website hero background. Create a breathtaking quiet aerial photograph of a serpentine turquoise alpine river flowing through a broad dark sage-green valley, pale limestone mountains far away, early morning soft atmospheric light. Cinematic contemporary fine art landscape photography with delicate cloud haze and subtle film grain, rich natural texture, muted turquoise, sage green, cool stone and warm ivory. Composition very wide panoramic 2.25:1, the meandering river forms an elegant curve right of centre, dark green forest/valley with enough calm dark midtones across centre for separate white HTML text to be readable. Image ONLY, flat artwork not a mockup, no table, no mat edges, no keyboard, no objects, no typography, no watermark, no logos. Premium photographic detail, natural and restrained, not fantasy, not oversaturated. Output high resolution landscape.

Команды запуска остаются прежними: `npm run dev`; затем http://127.0.0.1:5173/custom. Публикация не выполняется. Коммерческие ограничения прототипа сохранены.

## Проверки

- `npm test`: 16/16 PASS.
- `npm run build` (включая TypeScript): PASS.
- `npm run format:check`: PASS.
- `npm run test:browser`: 5/5 PASS, включая три регрессионных сценария конструктора. После изменения мобильной сетки отдельно повторены два теста лендинга/reduced motion: 2/2 PASS.
- Ширины 320, 390, 768, 1440 px; прокрутка вперёд/назад, текст, размеры галереи, отсутствие горизонтального переполнения, фиксированная шапка, якоря, мобильное меню/Escape, CTA, reduced motion.
- Независимые review и QA: P0/P1 не обнаружены. По снимкам исправлены раннее проявление шва, крупная текстура при начальном приближении и пересечение подписи с компактным ковриком в демонстрации.
- Скриншоты: `docs/screenshots/premium-landing-{width}-{top,mid,end}.png`, `premium-reduced-motion-{width}.png`, `premium-content-1440.png`. Viewport-снимки отражают scroll-сцену точнее, чем fullPage-снимки sticky-контента.
- Реальные Safari/iOS-устройства не проверены. Полный WCAG-аудит не выполнялся.
- Git-репозитория по-прежнему нет; whitespace затронутых исходников проверен через `git diff --no-index --check`.
- После правки демонстрационного блока отдельно повторён тест лендинга: 1/1 PASS. Для обоих форматов на 320/390/768/1440 px проверены реальные bounding boxes: верх коврика ниже верхней подписи, низ выше подписи размера. Открытых замечаний по проведённым review/QA нет.
