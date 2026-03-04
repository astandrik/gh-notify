import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import type { GitHubNotification, FetchResult, TokenValidation } from "./types.js";

function createClient(token: string): Octokit {
  return new Octokit({ auth: token, userAgent: "gh-notify-telegram-bot" });
}

export async function fetchNotifications(
  token: string,
  lastModified: string | null = null,
): Promise<FetchResult> {
  const octokit = createClient(token);

  try {
    const response = await octokit.rest.activity.listNotificationsForAuthenticatedUser({
      participating: true,
      headers: lastModified ? { "if-modified-since": lastModified } : {},
    });

    const notifications: GitHubNotification[] = response.data.map((n) => ({
      id: n.id,
      reason: n.reason,
      repository: n.repository
        ? { full_name: n.repository.full_name }
        : undefined,
      subject: n.subject
        ? {
            type: n.subject.type,
            title: n.subject.title,
            url: n.subject.url ?? "",
          }
        : undefined,
    }));

    const newLastModified =
      response.headers["last-modified"] ?? lastModified;

    return { notifications, lastModified: newLastModified ?? null };
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.status === 304) {
        return { notifications: [], lastModified };
      }
      if (error.status === 401) {
        throw new Error("GitHub API 401: authentication failed. Check your token.");
      }
      if (error.status === 403) {
        const remaining = error.response?.headers?.["x-ratelimit-remaining"];
        if (remaining === "0") {
          const reset = error.response?.headers?.["x-ratelimit-reset"];
          const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
          console.warn(`[github] Rate limited. Resets at ${resetDate}. Skipping cycle.`);
          return { notifications: [], lastModified };
        }
        throw new Error("GitHub API 403: forbidden. Check your token permissions.");
      }
      if (error.status === 429) {
        const reset = error.response?.headers?.["x-ratelimit-reset"];
        const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
        console.warn(`[github] Rate limited (429). Resets at ${resetDate}. Skipping cycle.`);
        return { notifications: [], lastModified };
      }
      throw new Error(`GitHub API ${error.status}: ${error.message}`);
    }
    throw error;
  }
}

export async function markAsRead(token: string, threadId: string): Promise<void> {
  const octokit = createClient(token);

  try {
    await octokit.rest.activity.markThreadAsRead({
      thread_id: Number(threadId),
    });
  } catch (error) {
    if (error instanceof RequestError) {
      console.warn(`[github] Failed to mark thread ${threadId} as read: ${error.status}`);
      return;
    }
    throw error;
  }
}

export async function validateToken(token: string): Promise<TokenValidation> {
  try {
    const octokit = createClient(token);
    const { data } = await octokit.rest.users.getAuthenticated();
    return { valid: true, login: data.login };
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
