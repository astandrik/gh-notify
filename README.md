# gh-notify

GitHub notifications → Telegram bot.

Поллит GitHub Notifications API и пересылает упоминания, запросы на ревью, комменты и назначения прямо в Telegram.

```
GitHub Notifications API
        │
        │  poll (60s)
        ▼
   gh-notify worker
        │
        │  filter + format
        ▼
   Telegram Bot API
        │
        ▼
   Your Telegram chat
```

---

## TL;DR

```bash
git clone https://github.com/astandrik/gh-notify.git && cd gh-notify
cp .env.example .env
# заполни TG_BOT_TOKEN и GH_TOKEN в .env
docker compose up -d
# отправь /start боту в Telegram — готово!
```

---

## Содержание

- [Требования](#требования)
- [Получение токенов](#получение-токенов)
- [Установка и запуск](#установка-и-запуск)
- [Команды бота](#команды-бота)
- [Поддерживаемые события](#поддерживаемые-события)
- [Переменные окружения](#переменные-окружения)
- [Структура проекта](#структура-проекта)
- [Как это работает](#как-это-работает)
- [Тесты](#тесты)
- [Обновление](#обновление)
- [Troubleshooting](#troubleshooting)

---

## Требования

- **Node.js** >= 18 (рекомендуется 22 LTS)
- **npm** >= 8
- **Docker** + **Docker Compose** (опционально, для контейнерного запуска)
- Telegram-аккаунт
- GitHub-аккаунт

> Проект написан на **TypeScript** и запускается через [tsx](https://github.com/privatenumber/tsx) — без шага компиляции.

---

## Получение токенов

### Telegram Bot Token

1. Открой [@BotFather](https://t.me/BotFather) в Telegram
2. Отправь `/newbot`
3. Следуй инструкциям — задай имя и username бота
4. BotFather вернёт токен вида `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
5. Сохрани его — это `TG_BOT_TOKEN`

### GitHub Personal Access Token (PAT)

1. Перейди в [GitHub Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Нажми **Generate new token**
3. Задай имя (например, `gh-notify`)
4. Выбери **Repository access** → All repositories (или конкретные)
5. В разделе **Permissions** включи:
   - **Notifications** → Read
   - **Pull requests** → Read
   - **Issues** → Read
6. Нажми **Generate token** и скопируй — это `GH_TOKEN`

> ⚠️ Токен показывается только один раз. Если потерял — создай новый.

### Chat ID (опционально)

Chat ID определяется автоматически при отправке `/start` боту. Но если хочешь задать вручную:

1. Напиши своему боту любое сообщение
2. Открой `https://api.telegram.org/bot<TG_BOT_TOKEN>/getUpdates`
3. Найди `"chat": { "id": 123456789 }` — это твой `CHAT_ID`

---

## Установка и запуск

### Вариант 1: Docker (рекомендуется)

**Клонирование:**

```bash
git clone https://github.com/astandrik/gh-notify.git
cd gh-notify
```

**Конфигурация:**

```bash
cp .env.example .env
```

Отредактируй `.env` — заполни как минимум два поля:

```env
TG_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
GH_TOKEN=github_pat_xxxxxxxxxxxxxxxx
```

**Сборка и запуск:**

```bash
docker compose up -d
```

**Проверка логов:**

```bash
docker compose logs -f
```

Ожидаемый вывод:

```
bot-1  | [bot] Starting gh-notify...
bot-1  | [bot] Poll interval: 60000ms
bot-1  | [bot] GitHub token: configured
bot-1  | [bot] Chat ID: not set (use /start)
bot-1  | [bot] Telegram bot is running.
```

**Остановка:**

```bash
docker compose down
```

**Пересборка после обновления кода:**

```bash
docker compose up -d --build
```

### Вариант 2: Без Docker (Node.js напрямую)

**Клонирование:**

```bash
git clone https://github.com/astandrik/gh-notify.git
cd gh-notify
```

**Установка зависимостей:**

```bash
npm install
```

**Конфигурация:**

```bash
cp .env.example .env
# отредактируй .env — заполни TG_BOT_TOKEN и GH_TOKEN
```

**Запуск:**

```bash
npm start
```

Или напрямую:

```bash
npx tsx src/index.ts
```

> ⚠️ `npm start` и `npx tsx` не загружают `.env` автоматически. Экспортируй переменные перед запуском или используй Docker (рекомендуется).

**Запуск в фоне (через systemd / pm2 / nohup):**

```bash
# pm2 (рекомендуется для production)
npm install -g pm2
pm2 start npx --name gh-notify -- tsx src/index.ts
pm2 save
pm2 startup

# или через nohup
nohup npm start > gh-notify.log 2>&1 &
```

### Вариант 3: Cron (минимальный)

Если не нужен постоянно работающий процесс:

```bash
# Добавить в crontab -e
* * * * * cd /path/to/gh-notify && npx tsx src/index.ts
```

> ⚠️ Этот вариант не поддерживает команды бота — только отправку уведомлений.

---

## Первый запуск

1. Запусти бота одним из способов выше
2. Открой своего бота в Telegram
3. Отправь `/start`
4. Бот ответит приветствием и автоматически сохранит твой chat ID
5. Если GitHub токен задан в `.env` — уведомления начнут приходить сразу
6. Если нет — отправь `/auth <твой_github_токен>` (сообщение будет автоматически удалено)

---

## Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Инициализация, автоопределение chat ID |
| `/auth <token>` | Установить GitHub PAT (сообщение удаляется автоматически 🔒) |
| `/subscribe` | Управление подписками — inline-кнопки для каждого типа события |
| `/unsubscribe` | Отключить все уведомления |
| `/status` | Текущая конфигурация: токен, подписки, статус |
| `/help` | Справка по командам |

---

## Поддерживаемые события

По умолчанию бот подписан на 4 основных типа событий. Управлять подписками можно через `/subscribe`.

| Событие | Emoji | Описание | По умолчанию |
|---------|-------|----------|:------------:|
| `mention` | 💬 | Тебя упомянули (@username) | ✅ |
| `review_requested` | 👀 | Запрос на ревью PR | ✅ |
| `comment` | 🗨️ | Коммент к твоему PR/issue | ✅ |
| `assign` | 📌 | Тебя назначили на issue/PR | ✅ |
| `team_mention` | 👥 | Упоминание твоей команды | ❌ |
| `ci_activity` | ⚙️ | CI/CD активность | ❌ |
| `state_change` | 🔄 | Изменение статуса | ❌ |
| `subscribed` | 🔔 | Подписан на тред | ❌ |
| `author` | ✍️ | Ты автор | ❌ |
| `approval_requested` | ✅ | Запрос на approval | ❌ |

---

## Пример уведомления

В Telegram придёт сообщение:

```
👀 Review requested

📦 astandrik/ydb-qdrant
PullRequest: Fix vector search
🔗 Open on GitHub        ← кликабельная ссылка
```

---

## Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|------------|:------------:|:------------:|----------|
| `TG_BOT_TOKEN` | ✅ | — | Токен Telegram бота от @BotFather |
| `GH_TOKEN` | ❌ | — | GitHub PAT (можно задать через `/auth` в боте) |
| `CHAT_ID` | ❌ | — | Автоопределяется при `/start` |
| `POLL_INTERVAL` | ❌ | `60000` | Интервал опроса GitHub API в миллисекундах |

---

## Структура проекта

```
gh-notify/
├── src/
│   ├── types.ts           # Общие TypeScript интерфейсы
│   ├── index.ts           # Точка входа: запуск бота + polling loop
│   ├── bot.ts             # Telegram бот (grammy): команды и inline-кнопки
│   ├── github.ts          # GitHub API клиент: polling, mark-as-read, URL
│   ├── formatter.ts       # Форматирование уведомлений → Telegram HTML
│   ├── store.ts           # Персистентное хранилище (JSON файл)
│   ├── config.ts          # Загрузка переменных окружения
│   ├── formatter.test.ts  # Тесты форматирования (31 тест)
│   ├── github.test.ts     # Тесты GitHub API (26 тестов)
│   └── store.test.ts      # Тесты хранилища (22 теста)
├── tsconfig.json          # Конфигурация TypeScript (strict)
├── data/                  # Рантайм-данные (state.json) — в .gitignore
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example           # Шаблон конфигурации
├── .dockerignore
└── .gitignore
```

---

## Как это работает

1. **Polling**: бот делает `GET /notifications?participating=true` каждые 60 секунд
2. **Эффективность**: использует заголовок `If-Modified-Since` — GitHub отвечает `304 Not Modified` если нет новых уведомлений (не тратит rate limit)
3. **Фильтрация**: пропускает только события из списка подписок пользователя
4. **Дедупликация**: хранит ID последних 500 уведомлений чтобы не слать повторно
5. **Форматирование**: каждое уведомление форматируется в HTML с emoji, названием репо, заголовком и кликабельной ссылкой
6. **Mark-as-read**: после отправки в Telegram уведомление помечается прочитанным на GitHub
7. **Персистентность**: состояние сохраняется в `data/state.json` — переживает перезапуск

### Rate limits

GitHub API: **5,000 запросов/час**.
Бот делает **1 запрос/минуту** = **60 запросов/час** — это 1.2% от лимита.

---

## Тесты

Запуск всех тестов:

```bash
npm test
```

Проверка типов:

```bash
npm run typecheck
```

Запуск тестов конкретного модуля:

```bash
npx tsx --test src/github.test.ts
npx tsx --test src/formatter.test.ts
npx tsx --test src/store.test.ts
```

Текущее покрытие: **77 тестов** — `github.ts`, `formatter.ts`, `store.ts`.

---

## Обновление

### Docker

```bash
cd gh-notify
git pull
docker compose up -d --build
```

### Node.js

```bash
cd gh-notify
git pull
npm install
# перезапустить процесс (pm2 restart gh-notify / systemctl restart gh-notify / etc)
```

Данные (state.json) сохраняются между обновлениями — конфигурация бота и подписки не теряются.

---

## Troubleshooting

### Бот не отвечает на команды

- Убедись что `TG_BOT_TOKEN` правильный
- Проверь логи: `docker compose logs -f` или вывод в терминал
- Убедись что ты пишешь именно своему боту (не чужому)

### Уведомления не приходят

- Проверь `/status` — GitHub должен быть `✅ connected`, notifications `🔔 enabled`
- Убедись что `GH_TOKEN` имеет права на notifications
- Проверь что есть непрочитанные уведомления на GitHub
- Бот поллит только `participating=true` — это уведомления где ты непосредственно участвуешь

### `Error: TG_BOT_TOKEN is required`

Не задан токен Telegram бота. Создай `.env` файл:

```bash
cp .env.example .env
# заполни TG_BOT_TOKEN
```

### `GitHub API 401: authentication failed`

Невалидный GitHub токен. Создай новый:
[GitHub Settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)

### Docker: `permission denied`

```bash
sudo docker compose up -d
```

Или добавь пользователя в группу docker:

```bash
sudo usermod -aG docker $USER
# перелогинься
```

### Данные потерялись после перезапуска Docker

Убедись что volume подключён в `docker-compose.yml`:

```yaml
volumes:
  - bot-data:/app/data
```

При использовании `docker compose down -v` volumes удаляются. Используй `docker compose down` без `-v`.
