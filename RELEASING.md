# Выпуск Zoomix

Процесс повторяет Tvist: GitHub Release запускает `.github/workflows/publish.yml`. Проверяется совпадение тега с package.json, выполняются браузерные тесты и проверка production-сайта, затем создаётся npm-архив. Из одного архива берутся файлы GitHub Release и пакет для npm. Обычные версии получают npm-тег `latest`, GitHub pre-release — `next`.

## Текущее состояние

- Первый пакет `zoomix@0.1.0` опубликован в npm, тег `latest` указывает на `0.1.0`.
- Trusted Publisher настроен: GitHub Actions, репозиторий `VladimirIvanin/zoomix`, workflow `publish.yml`, без environment. NPM_TOKEN не требуется.
- GitHub Pages опубликован: https://vladimirivanin.github.io/zoomix/ . CI и deployment прошли успешно.
- `0.1.0` опубликована вручную для первоначальной регистрации пакета. Следующий автоматический выпуск должен иметь новую версию, например `0.1.1`. Не создавать GitHub Release `v0.1.0` с повторной npm-публикацией.

Настройка Trusted Publisher находится в npm → пакет zoomix → Settings. В случае переноса репозитория или переименования workflow обновить эту связь. Официальная справка: https://docs.npmjs.com/trusted-publishers/ .

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
