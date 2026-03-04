const EMOJI_MAP = {
  mention: "💬",
  review_requested: "👀",
  assign: "📌",
  comment: "🗨️",
  ci_activity: "⚙️",
  approval_requested: "✅",
  state_change: "🔄",
  subscribed: "🔔",
  team_mention: "👥",
  author: "✍️",
};

const REASON_LABEL = {
  mention: "Mention",
  review_requested: "Review requested",
  assign: "Assigned",
  comment: "Comment",
  ci_activity: "CI activity",
  approval_requested: "Approval requested",
  state_change: "State change",
  subscribed: "Subscribed",
  team_mention: "Team mention",
  author: "Author",
};

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format a GitHub notification into a Telegram message.
 *
 * @param {object} notification  GitHub notification object
 * @param {string} htmlUrl       clickable URL to the item
 * @returns {{ text: string, parseMode: string }}
 */
export function formatNotification(notification, htmlUrl) {
  const reason = notification.reason || "unknown";
  const emoji = EMOJI_MAP[reason] || "🔔";
  const label = REASON_LABEL[reason] || reason;
  const repo = escapeHtml(notification.repository?.full_name || "unknown");
  const type = escapeHtml(notification.subject?.type || "");
  const title = escapeHtml(notification.subject?.title || "");

  const text = [
    `${emoji} <b>${escapeHtml(label)}</b>`,
    "",
    `📦 <code>${repo}</code>`,
    `${type}: ${title}`,
    `🔗 <a href="${htmlUrl}">Open on GitHub</a>`,
  ].join("\n");

  return { text, parseMode: "HTML" };
}

export { EMOJI_MAP, REASON_LABEL, escapeHtml };
