import config from "./config.js";
import { load, save } from "./store.js";
import { createBot } from "./bot.js";
import { fetchNotifications, markAsRead, buildHtmlUrl } from "./github.js";
import { formatNotification } from "./formatter.js";

async function main() {
  const state = await load({
    ghToken: config.ghToken,
    chatId: config.chatId,
  });

  const bot = createBot(config.tgBotToken, state);

  // GitHub notifications polling loop
  let pollPromise = null;
  let shuttingDown = false;

  async function pollNotifications() {
    if (shuttingDown) return;
    if (pollPromise) return;
    if (!state.enabled || !state.githubToken || !state.chatId) return;

    const run = async () => {
      const { notifications, lastModified } = await fetchNotifications(
        state.githubToken,
        state.lastModified,
      );

      let newCount = 0;

      for (const n of notifications) {
        if (shuttingDown) break;
        if (state.seenIds.includes(n.id)) continue;
        if (!state.subscriptions.includes(n.reason)) continue;

        const url = buildHtmlUrl(n);
        const { text, parseMode } = formatNotification(n, url);

        try {
          await bot.api.sendMessage(state.chatId, text, { parse_mode: parseMode });
          newCount++;

          try {
            await markAsRead(state.githubToken, n.id);
          } catch (err) {
            console.warn(`[poll] Failed to mark ${n.id} as read:`, err.message);
          }

          state.seenIds.push(n.id);
        } catch (err) {
          console.error(`[poll] Failed to send message for ${n.id}:`, err.message);
        }
      }

      // Cap seenIds to prevent unbounded growth
      const MAX_SEEN = 500;
      if (state.seenIds.length > MAX_SEEN) {
        state.seenIds = state.seenIds.slice(-MAX_SEEN);
      }

      state.lastModified = lastModified ?? state.lastModified;
      await save(state);

      if (newCount > 0) {
        console.log(`[poll] Sent ${newCount} notification(s)`);
      }
    };

    pollPromise = run()
      .catch((err) => console.error("[poll] Error:", err.message))
      .finally(() => { pollPromise = null; });

    return pollPromise;
  }

  // Start polling
  const intervalId = setInterval(pollNotifications, config.pollInterval);

  // Run first poll immediately
  pollNotifications();

  // Graceful shutdown
  let shutdownInProgress = false;

  async function shutdown(signal) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    shuttingDown = true;

    console.log(`\n[shutdown] Received ${signal}. Saving state and stopping...`);
    clearInterval(intervalId);

    try {
      if (pollPromise) {
        await pollPromise;
      }
      await save(state);
      bot.stop();
      process.exit(0);
    } catch (err) {
      console.error("[shutdown] Error:", err.message);
      process.exit(1);
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start Telegram bot (long polling)
  console.log("[bot] Starting gh-notify...");
  console.log(`[bot] Poll interval: ${config.pollInterval}ms`);
  console.log(`[bot] GitHub token: ${state.githubToken ? "configured" : "not set"}`);
  console.log(`[bot] Chat ID: ${state.chatId || "not set (use /start)"}`);

  bot.start({
    onStart: () => console.log("[bot] Telegram bot is running."),
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
