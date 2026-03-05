import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { buildHtmlUrl, fetchNotifications, markAsRead, validateToken } from "./github.js";
import type { GitHubNotification } from "./types.js";

/**
 * Stub globalThis.fetch to intercept octokit's HTTP calls.
 * Octokit uses fetch internally, so we mock at the fetch level.
 */
function stubFetch(fn: (...args: Parameters<typeof fetch>) => Promise<Partial<Response>>): void {
  globalThis.fetch = mock.fn(fn) as typeof fetch;
}

function jsonResponse(data: Record<string, unknown> | unknown[], status = 200, extraHeaders: Record<string, string> = {}): Partial<Response> {
  const body = JSON.stringify(data);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", ...extraHeaders });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers,
    json: async () => JSON.parse(body),
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
    url: "https://api.github.com",
    redirected: false,
  };
}

// ─── buildHtmlUrl ────────────────────────────────────────────────────

describe("buildHtmlUrl", () => {
  it("converts pull request API URL to HTML URL", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "PullRequest", title: "", url: "https://api.github.com/repos/owner/repo/pulls/42" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/pull/42");
  });

  it("converts issue API URL to HTML URL", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Issue", title: "", url: "https://api.github.com/repos/owner/repo/issues/123" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/issues/123");
  });

  it("converts commit API URL to HTML URL", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Commit", title: "", url: "https://api.github.com/repos/owner/repo/commits/abc123def" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/commit/abc123def");
  });

  it("converts release to releases page", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Release", title: "", url: "https://api.github.com/repos/owner/repo/releases/99" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/releases");
  });

  it("handles Discussion type", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Discussion", title: "", url: "" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/discussions");
  });

  it("handles Discussion type even with a valid subject URL", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Discussion", title: "", url: "https://api.github.com/repos/owner/repo/discussions/5" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/discussions");
  });

  it("falls back to repo URL for unknown types", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "Unknown", title: "", url: "https://api.github.com/repos/owner/repo/something/else" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo");
  });

  it("falls back when subject.url is missing", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "PullRequest", title: "", url: "" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo");
  });

  it("falls back when subject is missing entirely", () => {
    const n: GitHubNotification = { id: "1", reason: "mention", repository: { full_name: "owner/repo" } };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo");
  });

  it("falls back to github.com when repository is missing", () => {
    const n: GitHubNotification = { id: "1", reason: "mention", subject: { type: "PullRequest", title: "", url: "" } };
    assert.equal(buildHtmlUrl(n), "https://github.com");
  });

  it("handles high pull request numbers", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "org/monorepo" },
      subject: { type: "PullRequest", title: "", url: "https://api.github.com/repos/org/monorepo/pulls/99999" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/org/monorepo/pull/99999");
  });

  it("handles repos with dots and hyphens in name", () => {
    const n: GitHubNotification = {
      id: "1", reason: "mention",
      repository: { full_name: "my-org/my.repo-name" },
      subject: { type: "Issue", title: "", url: "https://api.github.com/repos/my-org/my.repo-name/issues/7" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/my-org/my.repo-name/issues/7");
  });
});

// ─── fetchNotifications ──────────────────────────────────────────────

describe("fetchNotifications", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns notifications on 200", async () => {
    const fakeData = [
      {
        id: "1",
        reason: "mention",
        repository: { full_name: "a/b" },
        subject: { title: "Fix", type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/1" },
      },
    ];

    stubFetch(async () =>
      jsonResponse(fakeData, 200, { "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT" }),
    );

    const result = await fetchNotifications("gh_token_123");

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].id, "1");
    assert.equal(result.lastModified, "Thu, 01 Jan 2026 00:00:00 GMT");
  });

  it("returns empty array on 304 Not Modified", async () => {
    stubFetch(async () => jsonResponse({}, 304));

    const result = await fetchNotifications("gh_token_123", "some-date");

    assert.deepEqual(result.notifications, []);
    assert.equal(result.lastModified, "some-date");
  });

  it("throws on 401 unauthorized", async () => {
    stubFetch(async () => jsonResponse({ message: "Bad credentials" }, 401));

    await assert.rejects(
      () => fetchNotifications("bad_token"),
      { message: /authentication failed/i },
    );
  });

  it("throws on 403 forbidden", async () => {
    stubFetch(async () => jsonResponse({ message: "Forbidden" }, 403));

    await assert.rejects(
      () => fetchNotifications("gh_token_123"),
      { message: /403.*forbidden/i },
    );
  });

  it("gracefully skips on 403 rate limit", async () => {
    stubFetch(async () =>
      jsonResponse({ message: "rate limit exceeded" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      }),
    );

    const result = await fetchNotifications("gh_token_123", "some-date");
    assert.deepEqual(result.notifications, []);
    assert.equal(result.lastModified, "some-date");
  });

  it("gracefully skips on 429 rate limit", async () => {
    stubFetch(async () =>
      jsonResponse({ message: "rate limit exceeded" }, 429, {
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      }),
    );

    const result = await fetchNotifications("gh_token_123", "some-date");
    assert.deepEqual(result.notifications, []);
    assert.equal(result.lastModified, "some-date");
  });
});

// ─── markAsRead ──────────────────────────────────────────────────────

describe("markAsRead", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the correct thread endpoint", async () => {
    let capturedUrl = "";

    stubFetch(async (url) => {
      capturedUrl = String(url);
      return jsonResponse({}, 205);
    });

    await markAsRead("token123", "42");

    assert.ok(capturedUrl.includes("/notifications/threads/42"));
  });

  it("does not throw on error response", async () => {
    stubFetch(async () => jsonResponse({ message: "Not Found" }, 404));

    await assert.doesNotReject(() => markAsRead("token123", "missing"));
  });
});

// ─── validateToken ───────────────────────────────────────────────────

describe("validateToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns valid=true and login on success", async () => {
    stubFetch(async () => jsonResponse({ login: "astandrik" }));

    const result = await validateToken("good_token");

    assert.equal(result.valid, true);
    assert.equal(result.login, "astandrik");
  });

  it("returns valid=false on 401", async () => {
    stubFetch(async () => jsonResponse({ message: "Bad credentials" }, 401));

    const result = await validateToken("bad_token");
    assert.equal(result.valid, false);
  });

  it("returns valid=false on network error", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;

    const result = await validateToken("whatever");
    assert.equal(result.valid, false);
  });
});
