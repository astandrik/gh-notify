import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { buildHtmlUrl, fetchNotifications, markAsRead, validateToken } from "./github.js";
import type { GitHubNotification } from "./types.js";

/**
 * Helper to stub globalThis.fetch in tests.
 * Test stubs implement only the subset of Response our code uses.
 */
function stubFetch(fn: (...args: Parameters<typeof fetch>) => Promise<Partial<Response>>): void {
  globalThis.fetch = mock.fn(fn) as typeof fetch;
}

function h(entries: [string, string][] = []): Headers {
  return new Headers(entries);
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
    const fakeNotifications: GitHubNotification[] = [
      { id: "1", reason: "mention", repository: { full_name: "a/b" } },
    ];

    stubFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => fakeNotifications,
      headers: h([["last-modified", "Thu, 01 Jan 2026 00:00:00 GMT"]]),
    }));

    const result = await fetchNotifications("gh_token_123");

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].id, "1");
    assert.equal(result.lastModified, "Thu, 01 Jan 2026 00:00:00 GMT");
  });

  it("returns empty array on 304 Not Modified", async () => {
    stubFetch(async () => ({
      status: 304,
      ok: false,
      headers: h(),
    }));

    const result = await fetchNotifications("gh_token_123", "some-date");

    assert.deepEqual(result.notifications, []);
    assert.equal(result.lastModified, "some-date");
  });

  it("throws on 401 unauthorized", async () => {
    stubFetch(async () => ({
      status: 401,
      ok: false,
      headers: h([["x-ratelimit-remaining", "4999"]]),
    }));

    await assert.rejects(
      () => fetchNotifications("bad_token"),
      { message: /authentication failed/i },
    );
  });

  it("skips cycle on rate limit (403 + remaining=0)", async () => {
    stubFetch(async () => ({
      status: 403,
      ok: false,
      headers: h([
        ["x-ratelimit-remaining", "0"],
        ["x-ratelimit-reset", "1700000000"],
      ]),
    }));

    const result = await fetchNotifications("gh_token_123", "old-date");

    assert.deepEqual(result.notifications, []);
    assert.equal(result.lastModified, "old-date");
  });

  it("throws on 403 that is not rate limit", async () => {
    stubFetch(async () => ({
      status: 403,
      ok: false,
      headers: h([["x-ratelimit-remaining", "100"]]),
    }));

    await assert.rejects(
      () => fetchNotifications("gh_token_123"),
      { message: /authentication failed/i },
    );
  });

  it("throws on unexpected HTTP errors (500)", async () => {
    stubFetch(async () => ({
      status: 500,
      ok: false,
      statusText: "Internal Server Error",
      headers: h(),
    }));

    await assert.rejects(
      () => fetchNotifications("gh_token_123"),
      { message: /500.*Internal Server Error/i },
    );
  });

  it("sends If-Modified-Since header when lastModified provided", async () => {
    let capturedHeaders: Record<string, string> = {};

    stubFetch(async (_url, opts) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return { status: 304, ok: false, headers: h() };
    });

    await fetchNotifications("token", "Wed, 01 Jan 2025 00:00:00 GMT");

    assert.equal(capturedHeaders["If-Modified-Since"], "Wed, 01 Jan 2025 00:00:00 GMT");
  });

  it("does not send If-Modified-Since when lastModified is null", async () => {
    let capturedHeaders: Record<string, string> = {};

    stubFetch(async (_url, opts) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return { status: 200, ok: true, json: async () => [], headers: h() };
    });

    await fetchNotifications("token", null);

    assert.equal(capturedHeaders["If-Modified-Since"], undefined);
  });

  it("preserves lastModified when response has no Last-Modified header", async () => {
    stubFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => [],
      headers: h(),
    }));

    const result = await fetchNotifications("token", "old-value");
    assert.equal(result.lastModified, "old-value");
  });
});

// ─── markAsRead ──────────────────────────────────────────────────────

describe("markAsRead", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends PATCH request to correct thread URL", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    stubFetch(async (url, opts) => {
      capturedUrl = String(url);
      capturedMethod = opts?.method || "";
      return { ok: true, status: 205 };
    });

    await markAsRead("token123", "thread_42");

    assert.ok(capturedUrl.includes("/notifications/threads/thread_42"));
    assert.equal(capturedMethod, "PATCH");
  });

  it("does not throw on non-ok response", async () => {
    stubFetch(async () => ({ ok: false, status: 404 }));

    await assert.doesNotReject(() => markAsRead("token123", "missing_thread"));
  });
});

// ─── validateToken ───────────────────────────────────────────────────

describe("validateToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns valid=true and login on success", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ login: "astandrik" }),
    }));

    const result = await validateToken("good_token");

    assert.equal(result.valid, true);
    assert.equal(result.login, "astandrik");
  });

  it("returns valid=false on 401", async () => {
    stubFetch(async () => ({ ok: false, status: 401 }));

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
