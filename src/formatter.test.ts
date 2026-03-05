import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNotification, escapeHtml, EMOJI_MAP, REASON_LABEL } from "./formatter.js";
import type { GitHubNotification } from "./types.js";

// ─── escapeHtml ──────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    assert.equal(escapeHtml("A & B"), "A &amp; B");
  });

  it("escapes angle brackets", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  });

  it("escapes mixed special characters", () => {
    assert.equal(escapeHtml("a < b & c > d"), "a &lt; b &amp; c &gt; d");
  });

  it("handles empty string", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("handles null", () => {
    assert.equal(escapeHtml(null), "");
  });

  it("handles undefined", () => {
    assert.equal(escapeHtml(undefined), "");
  });

  it("passes through plain text unchanged", () => {
    assert.equal(escapeHtml("Hello world 123"), "Hello world 123");
  });

  it("handles strings with only special characters", () => {
    assert.equal(escapeHtml("<>&"), "&lt;&gt;&amp;");
  });

  it("escapes double quotes", () => {
    assert.equal(escapeHtml('a "b" c'), "a &quot;b&quot; c");
  });
});

// ─── formatNotification — all known reason types ─────────────────────

describe("formatNotification — all reason types", () => {
  const baseNotification: GitHubNotification = {
    id: "1",
    reason: "mention",
    repository: { full_name: "owner/repo" },
    subject: { type: "PullRequest", title: "Test PR", url: "" },
  };
  const url = "https://github.com/owner/repo/pull/1";

  for (const [reason, emoji] of Object.entries(EMOJI_MAP)) {
    it(`formats '${reason}' with emoji ${emoji}`, () => {
      const n: GitHubNotification = { ...baseNotification, reason };
      const { text, parseMode } = formatNotification(n, url);

      assert.equal(parseMode, "HTML");
      assert.ok(text.includes(emoji), `Expected emoji ${emoji} in output`);
      assert.ok(
        text.includes(REASON_LABEL[reason]),
        `Expected label '${REASON_LABEL[reason]}' in output`,
      );
    });
  }

  it("handles unknown reason with fallback emoji 🔔", () => {
    const n: GitHubNotification = { ...baseNotification, reason: "future_reason" };
    const { text } = formatNotification(n, url);

    assert.ok(text.includes("🔔"));
    assert.ok(text.includes("future_reason"));
  });

  it("handles missing reason (undefined)", () => {
    const n = { id: "1", reason: "", repository: { full_name: "owner/repo" }, subject: { type: "PullRequest", title: "Test", url: "" } } satisfies GitHubNotification;
    const { text } = formatNotification({ ...n, reason: undefined as unknown as string }, url);

    assert.ok(text.includes("🔔"));
    assert.ok(text.includes("unknown"));
  });
});

// ─── formatNotification — output structure ───────────────────────────

describe("formatNotification — output structure", () => {
  it("includes repo name in code block", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      repository: { full_name: "org/project" },
      subject: { type: "Issue", title: "Bug", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/org/project/issues/1");

    assert.ok(text.includes("<code>org/project</code>"));
  });

  it("includes subject type and title", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "comment",
      repository: { full_name: "a/b" },
      subject: { type: "PullRequest", title: "Add feature X", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/a/b/pull/5");

    assert.ok(text.includes("PullRequest: Add feature X"));
  });

  it("includes clickable link", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "assign",
      repository: { full_name: "a/b" },
      subject: { type: "Issue", title: "Fix", url: "" },
    };
    const link = "https://github.com/a/b/issues/10";
    const { text } = formatNotification(n, link);

    assert.ok(text.includes(`<a href="${link}">Open on GitHub</a>`));
  });

  it("wraps reason label in bold", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "review_requested",
      repository: { full_name: "a/b" },
      subject: { type: "Issue", title: "Fix", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/a/b/pull/1");

    assert.ok(text.includes("<b>Review requested</b>"));
  });

  it("always returns parseMode HTML", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      repository: { full_name: "a/b" },
      subject: { type: "Issue", title: "x", url: "" },
    };
    const { parseMode } = formatNotification(n, "http://example.com");

    assert.equal(parseMode, "HTML");
  });
});

// ─── formatNotification — edge cases ─────────────────────────────────

describe("formatNotification — edge cases", () => {
  it("escapes HTML in title", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      repository: { full_name: "owner/repo" },
      subject: { type: "PullRequest", title: "Fix <script> & stuff", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("&lt;script&gt;"));
    assert.ok(text.includes("&amp;"));
    assert.ok(!text.includes("<script>"));
  });

  it("escapes HTML in repo name", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      repository: { full_name: "<evil>/repo" },
      subject: { type: "Issue", title: "test", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/evil/repo");

    assert.ok(text.includes("&lt;evil&gt;/repo"));
    assert.ok(!text.includes("<evil>"));
  });

  it("handles missing repository", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      subject: { type: "PullRequest", title: "test", url: "" },
    };
    const { text } = formatNotification(n, "https://github.com");

    assert.ok(text.includes("unknown"));
  });

  it("handles missing subject", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "mention",
      repository: { full_name: "a/b" },
    };
    const { text } = formatNotification(n, "https://github.com/a/b");

    assert.ok(typeof text === "string");
    assert.ok(text.includes("a/b"));
  });

  it("handles completely empty notification", () => {
    const n = { id: "", reason: "" } as GitHubNotification;
    const { text, parseMode } = formatNotification(n, "https://github.com");

    assert.equal(parseMode, "HTML");
    assert.ok(text.includes("🔔"));
    assert.ok(text.includes("unknown"));
  });

  it("handles title with quotes and special URL chars", () => {
    const n: GitHubNotification = {
      id: "1",
      reason: "comment",
      repository: { full_name: "a/b" },
      subject: { type: "PullRequest", title: 'Fix "encoding" issue & param=value', url: "" },
    };
    const { text } = formatNotification(n, "https://github.com/a/b/pull/1");

    assert.ok(text.includes("&amp;"));
    assert.ok(text.includes("&quot;encoding&quot;"));
  });
});
