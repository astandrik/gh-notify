const config = Object.freeze({
  tgBotToken: process.env.TG_BOT_TOKEN || "",
  ghToken: process.env.GH_TOKEN || "",
  chatId: process.env.CHAT_ID || "",
  pollInterval: parseInt(process.env.POLL_INTERVAL, 10) || 60_000,
});

if (!config.tgBotToken) {
  console.error("TG_BOT_TOKEN is required. Set it in .env or environment.");
  process.exit(1);
}

export default config;
