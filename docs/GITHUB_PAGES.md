# Публикация на GitHub Pages

Адрес: https://flouresscent.github.io/strogo.custom/

## Исправленная причина белого экрана

При проверке опубликованный HTML содержал `<script type="module" src="/src/main.tsx">`: GitHub Pages отдавал исходники из репозитория вместо Vite-сборки. Кроме того, приложение использовало пути `/assets/...` и `/custom/...` от корня домена, хотя сайт размещён в подпапке `/strogo.custom/`.

Теперь `.github/workflows/deploy-pages.yml` устанавливает зависимости, запускает тесты, получает фактический `base_path` из настроек Pages, собирает Vite и публикует только `dist/`. В Settings → Pages → Build and deployment должен быть выбран Source **GitHub Actions**. Пользователь подтвердил переключение при исправлении.

Workflow запускается при push в `main` и вручную через Actions → Deploy Strogo Custom to GitHub Pages → Run workflow. Разрешения записи Pages/OIDC ограничены задачей публикации; build имеет только чтение репозитория и Pages. Actions закреплены по SHA из официального примера Vite.

## Пути и маршруты

- Vite использует `VITE_BASE_PATH`; без переменной локальный сайт остаётся на `/`.
- `src/shared/urls.ts` адаптирует навигацию и DOM-адреса ресурсов к base-пути. Источники в модели дизайна сохраняются как `/assets/...`; data/blob URL загрузок не изменяются.
- `scripts/create-static-routes.mjs` создаёт `dist/custom/index.html` и `dist/custom/create/index.html`. Поэтому прямые ссылки и refresh работают на обычном static-хостинге без SPA rewrite или 404-редиректов.
- Файл `.nojekyll` создаётся в сборке, исходники, тесты и документация в публикацию не входят.

Доступные ссылки после успешной публикации:

- `/strogo.custom/` — лендинг;
- `/strogo.custom/custom/` — лендинг;
- `/strogo.custom/custom/create/` — конструктор.

## Проверка сборки локально

```sh
npm test
VITE_BASE_PATH=/strogo.custom/ npm run build
npx playwright test --config playwright.pages.config.ts
```

Последняя команда использует строгий static-сервер на 4174: отсутствующие файлы действительно возвращают 404, без fallback на index.html. Дополнительная проверка обычного dev-сайта: `npm run test:browser`.

Для обычной локальной сборки без подпапки: `npm run build` и `npm run preview`.

Проведено: 19/19 модульных тестов, 3/3 теста Pages-сборки и 7/7 регрессионных браузерных сценариев (Pages-тесты в обычном прогоне пропускаются намеренно), TypeScript, Prettier, `git diff --check`. Проверены прямые маршруты/refresh, HTTP-ресурсы, принты и логотип, загрузка PNG с прозрачностью, пипетка, сохранение/восстановление и непустой PNG-экспорт.

## Открытый доступ

Публична демонстрационная версия. Загрузки посетителя остаются в его браузере, платежей и настоящих заказов нет. Материалы и производственные условия сохраняют ограничения прототипа, описанные в README. Перед коммерческим запуском требуется отдельная подготовка.
