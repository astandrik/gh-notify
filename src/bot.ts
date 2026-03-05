import { Bot, InlineKeyboard, type Context } from "grammy";
import { validateToken } from "./github.js";
import { save } from "./store.js";
import { REASON_LABEL, escapeHtml } from "./formatter.js";
import type { AppState } from "./types.js";

const ALL_KNOWN_REASONS: string[] = Object.keys(REASON_LABEL);

export function createBot(token: string, state: AppState): Bot {
  const bot = new Bot(token);

  function isAuthorized(ctx: Context): boolean {
    if (ctx.chat?.type !== "private") return false;
    if (!state.chatId) return false;
    if (state.chatId !== String(ctx.chat.id)) return false;
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
    console.log(`[bot] Chat ID claimed by user ${ctx.chat.id}`);
    await save(state);

    const hasGh = Boolean(state.githubToken);
    const lines: string[] = [
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
    let messageDeleted = true;
    try {
      await ctx.deleteMessage();
    } catch {
      messageDeleted = false;
    }

    if (!isAuthorized(ctx)) {
      const warning = messageDeleted
        ? ""
        : "\n⚠️ Your message with the token could not be deleted. Please remove it manually.";
      await ctx.reply(`🔒 Not authorized. Use /start in a private chat first.${warning}`);
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

    const warning = messageDeleted
      ? ""
      : "\n\n⚠️ Could not delete your message with the token. Please delete it manually for security.";

    await ctx.reply(
      `✅ Authorized as <b>${escapeHtml(login ?? "")}</b>. Notifications are enabled.${warning}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("subscribe", async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply("🔒 Not authorized. Use /start in a private chat first.");
      return;
    }
    state.enabled = true;
    await save(state);
    await ctx.reply(
      "🔔 Notifications enabled. Toggle event types to receive:",
      { parse_mode: "HTML", reply_markup: buildSubscriptionKeyboard(state) },
    );
  });

  bot.command("unsubscribe", async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply("🔒 Not authorized. Use /start in a private chat first.");
      return;
    }
    state.enabled = false;
    await save(state);
    await ctx.reply("🔕 Notifications disabled.\nUse /subscribe to re-enable.");
  });

  bot.command("status", async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply("🔒 Not authorized. Use /start in a private chat first.");
      return;
    }
    const subs = state.subscriptions.length
      ? state.subscriptions.map((s) => `• ${escapeHtml(s)}`).join("\n")
      : "• none";

    const lines: string[] = [
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
    if (!isAuthorized(ctx)) {
      await ctx.reply("🔒 Not authorized. Use /start in a private chat first.");
      return;
    }
    const lines: string[] = [
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

  bot.callbackQuery(/^sub:(.+)$/, async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.answerCallbackQuery({ text: "Not authorized" });
      return;
    }

    const reason: string = ctx.match[1];

    if (!ALL_KNOWN_REASONS.includes(reason)) {
      await ctx.answerCallbackQuery({ text: "Unknown subscription type." });
      return;
    }

    const idx = state.subscriptions.indexOf(reason);
    if (idx >= 0) {
      state.subscriptions.splice(idx, 1);
    } else {
      state.subscriptions.push(reason);
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

function buildSubscriptionKeyboard(state: AppState): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const reason of ALL_KNOWN_REASONS) {
    const active = state.subscriptions.includes(reason);
    const label = `${active ? "✅" : "❌"} ${REASON_LABEL[reason] || reason}`;
    keyboard.text(label, `sub:${reason}`).row();
  }

  return keyboard;
}
