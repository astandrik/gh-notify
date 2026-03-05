import type { AppConfig } from "./types.js";

const MIN_POLL_INTERVAL = 10_000;
const DEFAULT_POLL_INTERVAL = 60_000;

const rawPollInterval = parseInt(process.env.POLL_INTERVAL || "", 10) || DEFAULT_POLL_INTERVAL;

const config: AppConfig = Object.freeze({
  tgBotToken: process.env.TG_BOT_TOKEN || "",
  ghToken: process.env.GH_TOKEN || "",
  chatId: process.env.CHAT_ID || "",
  pollInterval: Math.max(MIN_POLL_INTERVAL, rawPollInterval),
});

if (!config.tgBotToken) {
  console.error("TG_BOT_TOKEN is required. Set it in .env or environment.");
  process.exit(1);
}

export default config;
