# Выпуск Zoomix

Процесс повторяет Tvist: GitHub Release запускает `.github/workflows/publish.yml`. Проверяется совпадение тега с package.json, выполняются браузерные тесты и проверка production-сайта, затем создаётся npm-архив. Из одного архива берутся файлы GitHub Release и пакет для npm. Обычные версии получают npm-тег `latest`, GitHub pre-release — `next`.

## Однократная настройка сервисов

1. Загрузить исходники и workflows в `VladimirIvanin/zoomix`, ветка `main`.
2. В GitHub → Settings → Pages выбрать Source: **GitHub Actions**. Workflow `deploy-docs.yml` публикует сайт при push в main, публикации release и ручном запуске. Адрес: https://vladimirivanin.github.io/zoomix/ .
3. Пакет `zoomix` ещё не опубликован. Первый выпуск выполнить вручную из проверенного исходного состояния: `npm ci`, установить браузеры Playwright, `npm test`, `npm run test:site`, `npm pack`, `npm login`, `npm publish ./zoomix-0.1.0.tgz --access public`. npm может запросить подтверждение входа/2FA.
4. В npm → пакет zoomix → Settings → Trusted Publisher выбрать GitHub Actions: Organization/user **VladimirIvanin**, Repository **zoomix**, Workflow filename **publish.yml**, Environment оставить пустым. Разрешить прямой `npm publish`. Секрет NPM_TOKEN не нужен. Подробности: https://docs.npmjs.com/trusted-publishers/ .
5. После ручного первого выпуска следующий автоматический выпуск должен иметь новую версию, например `0.1.1`. Уже опубликованную версию npm повторно не принимает. Для вручную опубликованной `0.1.0` не запускать автоматическую публикацию повторно.

## Последующие выпуски

- Из чистого рабочего дерева выполнить `npm version patch` (или minor/major). Команда обновляет package.json и package-lock.json, создаёт коммит и тег `vX.Y.Z`.
- Отправить коммит и соответствующий тег в origin. На GitHub создать и опубликовать Release для этого тега. Сам push тега npm-публикацию не запускает.
- Для версии вроде `0.2.0-beta.1` обязательно отметить GitHub Release как pre-release. Workflow проверяет это до сборки.
- Проверить jobs `build`, `release-assets`, `publish`. Браузерные файлы могут появиться в Release раньше завершения npm-публикации; CDN становится доступен после успешной публикации npm.
- Если npm-публикация не прошла, исправить настройку сервиса и перезапустить только упавший job: он использует уже проверенный архив. Если версия уже опубликована, требуется новая версия.

## Файлы и подключение

В GitHub Release прикладываются `zoomix.min.js`, `zoomix.min.js.gz`, `zoomix.css` и `zoomix-X.Y.Z.tgz`. npm содержит ESM и типы в `dist/`, браузерные файлы в `browser-build/`; прежние пути `dist/` сохраняются.

После успешной публикации:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/zoomix@0.1.0/browser-build/zoomix.css">
<script defer src="https://cdn.jsdelivr.net/npm/zoomix@0.1.0/browser-build/zoomix.min.js"></script>
```

В виджетах магазина закреплять точную одинаковую версию JS и CSS. Для проверки последнего стабильного выпуска можно заменить версию на `latest`. Для ресурсов платформы InSales скачать файлы из Release и зарегистрировать их штатным способом на стороне платформы; workflow не изменяет каталог библиотек InSales.

## Локальные проверки

- `npm test` — сборка, размер, npm-архив/TypeScript/SSR и браузерная матрица.
- `npm run test:site` — сборка сайта и проверка его работы под `/zoomix/`.
- `npm run docs:preview` — просмотр собранного сайта.
- `npm run check:release` — проверка переменных RELEASE_TAG и PRERELEASE, используемая в CI.
