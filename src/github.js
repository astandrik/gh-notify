const API_BASE = "https://api.github.com";
const USER_AGENT = "gh-notify-telegram-bot";

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    ...extra,
  };
}

/**
 * Fetch new GitHub notifications.
 * Uses If-Modified-Since for efficient polling (304 = no new data).
 *
 * @param {string} token   GitHub PAT
 * @param {string|null} lastModified  value from previous Last-Modified header
 * @returns {{ notifications: object[], lastModified: string|null }}
 */
export async function fetchNotifications(token, lastModified = null) {
  const extra = {};
  if (lastModified) {
    extra["If-Modified-Since"] = lastModified;
  }

  const res = await fetch(
    `${API_BASE}/notifications?participating=true`,
    { headers: headers(token, extra) },
  );

  if (res.status === 304) {
    return { notifications: [], lastModified };
  }

  if (res.status === 401 || res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const reset = res.headers.get("x-ratelimit-reset");
      const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
      console.warn(`[github] Rate limited. Resets at ${resetDate}. Skipping cycle.`);
      return { notifications: [], lastModified };
    }
    throw new Error(`GitHub API ${res.status}: authentication failed. Check your token.`);
  }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }

  const notifications = await res.json();
  const newLastModified = res.headers.get("last-modified") || lastModified;

  return { notifications, lastModified: newLastModified };
}

/**
 * Mark a single notification thread as read.
 */
export async function markAsRead(token, threadId) {
  const res = await fetch(
    `${API_BASE}/notifications/threads/${threadId}`,
    { method: "PATCH", headers: headers(token) },
  );

  if (!res.ok && res.status !== 205) {
    console.warn(`[github] Failed to mark thread ${threadId} as read: ${res.status}`);
  }
}

/**
 * Validate a GitHub token by fetching the authenticated user.
 * @returns {{ valid: boolean, login?: string }}
 */
export async function validateToken(token) {
  try {
    const res = await fetch(`${API_BASE}/user`, { headers: headers(token) });
    if (res.ok) {
      const user = await res.json();
      return { valid: true, login: user.login };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Convert a GitHub API notification into a clickable HTML URL.
 *
 * subject.url examples:
 *   https://api.github.com/repos/owner/repo/pulls/123
 *   https://api.github.com/repos/owner/repo/issues/456
 *   https://api.github.com/repos/owner/repo/commits/abc123
 */
export function buildHtmlUrl(notification) {
  const repoFullName = notification.repository?.full_name;
  const subjectUrl = notification.subject?.url || "";
  const subjectType = notification.subject?.type;

  const base = `https://github.com/${repoFullName}`;

  if (!subjectUrl || !repoFullName) return base;

  const pullMatch = subjectUrl.match(/\/pulls\/(\d+)$/);
  if (pullMatch) return `${base}/pull/${pullMatch[1]}`;

  const issueMatch = subjectUrl.match(/\/issues\/(\d+)$/);
  if (issueMatch) return `${base}/issues/${issueMatch[1]}`;

  const commitMatch = subjectUrl.match(/\/commits\/([a-f0-9]+)$/);
  if (commitMatch) return `${base}/commit/${commitMatch[1]}`;

  const releaseMatch = subjectUrl.match(/\/releases\/(\d+)$/);
  if (releaseMatch) return `${base}/releases`;

  if (subjectType === "Discussion") return `${base}/discussions`;

  return base;
}
