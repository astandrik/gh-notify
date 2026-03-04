import { Bot, InlineKeyboard } from "grammy";
import { validateToken } from "./github.js";
import { save, DEFAULT_SUBSCRIPTIONS } from "./store.js";

/**
 * Create and configure the Telegram bot.
 *
 * @param {string} token   Telegram bot token
 * @param {object} state   Shared mutable state object (from store.load)
 * @returns {Bot}
 */
export function createBot(token, state) {
  const bot = new Bot(token);

  /**
   * Check if a chat is authorized to configure the bot.
   * Only private chats are allowed. If chatId is already set,
   * only the original owner can reconfigure.
   */
  function isAuthorized(ctx) {
    if (ctx.chat.type !== "private") return false;
    if (state.chatId && state.chatId !== String(ctx.chat.id)) return false;
    return true;
  }

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("⚠️ This bot only works in private chats.");
      return;
    }

    if (state.chatId && state.chatId !== String(ctx.chat.id)) {
      await ctx.reply("🔒 This bot is already configured for another user.");
      return;
    }

    state.chatId = String(ctx.chat.id);
    await save(state);

    const hasGh = Boolean(state.githubToken);
    const lines = [
      "🤖 <b>gh-notify</b> — GitHub → Telegram notifications",
      "",
      hasGh
        ? "✅ GitHub token is set."
        : '⚠️ GitHub token not configured. Use <code>/auth &lt;token&gt;</code> to set it.',
      "",
      "<b>Commands:</b>",
      "/auth &lt;token&gt; — set GitHub PAT",
      "/subscribe — manage event subscriptions",
      "/unsubscribe — disable notifications",
      "/status — current configuration",
      "/help — show this message",
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("auth", async (ctx) => {
    // Delete the message with the token for security
    try {
      await ctx.deleteMessage();
    } catch {
      // May fail if bot lacks delete permissions in groups
    }

    if (!isAuthorized(ctx)) {
      await ctx.reply("🔒 Not authorized. Use /start in a private chat first.");
      return;
    }

    const text = ctx.message?.text || "";
    const parts = text.split(/\s+/);
    const ghToken = parts[1];

    if (!ghToken) {
      await ctx.reply(
        "Usage: <code>/auth &lt;your_github_token&gt;</code>\n\n" +
          "The message will be deleted automatically for security.",
        { parse_mode: "HTML" },
      );
      return;
    }

    const { valid, login } = await validateToken(ghToken);

    if (!valid) {
      await ctx.reply("❌ Invalid GitHub token. Check permissions and try again.");
      return;
    }

    state.githubToken = ghToken;
    state.enabled = true;
    await save(state);

    await ctx.reply(`✅ Authorized as <b>${login}</b>. Notifications are enabled.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("subscribe", async (ctx) => {
    await ctx.reply(
      "Toggle event types to receive:",
      { parse_mode: "HTML", reply_markup: buildSubscriptionKeyboard(state) },
    );
  });

  bot.command("unsubscribe", async (ctx) => {
    state.enabled = false;
    await save(state);
    await ctx.reply("🔕 Notifications disabled.\nUse /subscribe to re-enable.");
  });

  bot.command("status", async (ctx) => {
    const subs = state.subscriptions.length
      ? state.subscriptions.map((s) => `• ${s}`).join("\n")
      : "• none";

    const lines = [
      "📊 <b>Status</b>",
      "",
      `GitHub: ${state.githubToken ? "✅ connected" : "❌ not connected"}`,
      `Notifications: ${state.enabled ? "🔔 enabled" : "🔕 disabled"}`,
      `Chat ID: <code>${state.chatId || "not set"}</code>`,
      "",
      "<b>Subscribed events:</b>",
      subs,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    const lines = [
      "🤖 <b>gh-notify</b> — commands:",
      "",
      "/start — initialize bot and detect chat ID",
      "/auth &lt;token&gt; — set GitHub Personal Access Token",
      "/subscribe — manage event subscriptions",
      "/unsubscribe — disable all notifications",
      "/status — show current configuration",
      "/help — show this message",
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // Handle inline keyboard callbacks for subscription toggles
  bot.callbackQuery(/^sub:(.+)$/, async (ctx) => {
    const reason = ctx.match[1];

    const idx = state.subscriptions.indexOf(reason);
    if (idx >= 0) {
      state.subscriptions.splice(idx, 1);
    } else {
      state.subscriptions.push(reason);
    }

    // Re-enable if user is subscribing to something
    if (state.subscriptions.length > 0) {
      state.enabled = true;
    }

    await save(state);

    await ctx.editMessageReplyMarkup({
      reply_markup: buildSubscriptionKeyboard(state),
    });
    await ctx.answerCallbackQuery({
      text: idx >= 0 ? `Unsubscribed from ${reason}` : `Subscribed to ${reason}`,
    });
  });

  return bot;
}

/**
 * Build an inline keyboard with toggle buttons for each event type.
 */
function buildSubscriptionKeyboard(state) {
  const allReasons = [...DEFAULT_SUBSCRIPTIONS];

  // Add any extra reasons the user might have from the API
  for (const r of state.subscriptions) {
    if (!allReasons.includes(r)) allReasons.push(r);
  }

  const keyboard = new InlineKeyboard();

  for (const reason of allReasons) {
    const active = state.subscriptions.includes(reason);
    const label = `${active ? "✅" : "❌"} ${reason}`;
    keyboard.text(label, `sub:${reason}`).row();
  }

  return keyboard;
}
