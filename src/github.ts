import type { GitHubNotification, FetchResult, TokenValidation } from "./types.js";

const API_BASE = "https://api.github.com";
const USER_AGENT = "gh-notify-telegram-bot";

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    ...extra,
  };
}

export async function fetchNotifications(
  token: string,
  lastModified: string | null = null,
): Promise<FetchResult> {
  const extra: Record<string, string> = {};
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

  const notifications = (await res.json()) as GitHubNotification[];
  const newLastModified = res.headers.get("last-modified") || lastModified;

  return { notifications, lastModified: newLastModified };
}

export async function markAsRead(token: string, threadId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/notifications/threads/${threadId}`,
    { method: "PATCH", headers: headers(token) },
  );

  if (!res.ok && res.status !== 205) {
    console.warn(`[github] Failed to mark thread ${threadId} as read: ${res.status}`);
  }
}

export async function validateToken(token: string): Promise<TokenValidation> {
  try {
    const res = await fetch(`${API_BASE}/user`, { headers: headers(token) });
    if (res.ok) {
      const user = (await res.json()) as { login: string };
      return { valid: true, login: user.login };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

export function buildHtmlUrl(notification: GitHubNotification): string {
  const repoFullName = notification.repository?.full_name;
  const subjectUrl = notification.subject?.url || "";
  const subjectType = notification.subject?.type;

  if (!repoFullName) return "https://github.com";

  const base = `https://github.com/${repoFullName}`;

  if (subjectType === "Discussion") return `${base}/discussions`;

  if (!subjectUrl) return base;

  const pullMatch = subjectUrl.match(/\/pulls\/(\d+)$/);
  if (pullMatch) return `${base}/pull/${pullMatch[1]}`;

  const issueMatch = subjectUrl.match(/\/issues\/(\d+)$/);
  if (issueMatch) return `${base}/issues/${issueMatch[1]}`;

  const commitMatch = subjectUrl.match(/\/commits\/([a-f0-9]+)$/);
  if (commitMatch) return `${base}/commit/${commitMatch[1]}`;

  const releaseMatch = subjectUrl.match(/\/releases\/(\d+)$/);
  if (releaseMatch) return `${base}/releases`;

  return base;
}
