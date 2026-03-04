# gh-notify

GitHub notifications → Telegram bot.

Polls the GitHub Notifications API and forwards mentions, review requests, comments, and assignments to your Telegram chat.

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

## TL;DR

```bash
git clone https://github.com/astandrik/gh-notify.git && cd gh-notify
cp .env.example .env
# fill TG_BOT_TOKEN and GH_TOKEN in .env
docker compose up -d
# send /start to your bot in Telegram — done!
```

## Quick Start

### 1. Create a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot`, follow the prompts
3. Copy the bot token

### 2. Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Set permissions:
   - **Notifications**: Read
   - **Pull requests**: Read
   - **Issues**: Read
3. Copy the token

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
TG_BOT_TOKEN=your_telegram_bot_token
GH_TOKEN=your_github_pat
```

### 4. Run

**With Docker (recommended):**

```bash
docker compose up -d
```

**Without Docker:**

```bash
npm install
npm start
```

### 5. Initialize

Send `/start` to your bot in Telegram. The bot will auto-detect your chat ID and start sending notifications.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot, detect chat ID |
| `/auth <token>` | Set GitHub token (message auto-deleted for security) |
| `/subscribe` | Toggle event types with inline buttons |
| `/unsubscribe` | Disable all notifications |
| `/status` | Show current configuration |
| `/help` | List available commands |

## Supported Events

| Event | Emoji | Description |
|-------|-------|-------------|
| `mention` | 💬 | Someone mentioned you |
| `review_requested` | 👀 | Review requested on a PR |
| `comment` | 🗨️ | Comment on your PR/issue |
| `assign` | 📌 | You were assigned |

## Notification Example

```
👀 Review requested

📦 owner/repo
PullRequest: Fix vector search
🔗 Open on GitHub
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TG_BOT_TOKEN` | ✅ | — | Telegram bot token from @BotFather |
| `GH_TOKEN` | ❌ | — | GitHub PAT (can also set via `/auth`) |
| `CHAT_ID` | ❌ | — | Auto-detected on `/start` |
| `POLL_INTERVAL` | ❌ | `60000` | Polling interval in ms |

## How It Works

1. Bot polls `GET /notifications?participating=true` every 60 seconds
2. Uses `If-Modified-Since` header for efficient polling (304 = no new data)
3. Filters notifications by subscribed event types
4. Formats and sends messages to Telegram with clickable links
5. Marks notifications as read on GitHub
6. Persists state (seen IDs, config) to `data/state.json`

## Rate Limits

GitHub API allows 5,000 requests/hour. Polling once per minute = 60 requests/hour — well within limits.
