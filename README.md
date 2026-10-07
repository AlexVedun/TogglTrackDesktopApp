# Toggl Track Desktop

Невелика Electron-оболонка для вебтаймера [Toggl Track](https://track.toggl.com/timer). Дані та обліковий запис залишаються в Toggl. Програма зберігає сеанс входу в локальному профілі Electron.

## Запуск із вихідного коду

Потрібні Node.js 22.12 або новіший та npm.

```sh
npm ci
npm start
```

Команда `npm start` компілює TypeScript і відкриває вікно програми. Перевірка типів: `npm run check`.

## Локальне збирання

Збирайте пакунок на відповідній операційній системі:

| Система | Команда | Результат у `dist/` |
| --- | --- | --- |
| Linux x64 | `npm run build:linux` | AppImage |
| Windows x64 | `npm run build:win` | інсталятор `.exe` |
| macOS Apple Silicon | `npm run build:mac` | образ `.dmg` для arm64 |

Для збирання каталогу програми без інсталятора виконайте `npm run build:dir`.

## Збирання в GitHub Actions

Workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) запускається після push, для pull request і вручну через **Actions → Build desktop apps → Run workflow**. Він збирає AppImage на Linux, інсталятор на Windows та DMG на macOS з Apple Silicon. Готові файли доступні як артефакти відповідного запуску на вкладці **Actions**.

macOS-пакунок у цьому workflow не підписаний сертифікатом Apple і не нотаризований. Під час першого запуску macOS може вимагати підтвердження в **System Settings → Privacy & Security**. Для розповсюдження поза власними пристроями потрібні підписування та нотаризація.

Посилання за межі Toggl відкриваються у системному браузері. Вхід через стороннього провайдера, наприклад Google або Apple, може не завершитися всередині оболонки через обмеження вбудованого браузера; за потреби скористайтеся входом за електронною поштою та паролем. Для роботи таймера потрібен доступ до мережі.

Це незалежна оболонка, а не офіційний клієнт Toggl.
