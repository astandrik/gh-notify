import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNotification, escapeHtml } from "./formatter.js";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    assert.equal(escapeHtml("A & B"), "A &amp; B");
  });

  it("escapes angle brackets", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  });

  it("handles empty/null input", () => {
    assert.equal(escapeHtml(""), "");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});

describe("formatNotification", () => {
  const baseNotification = {
    repository: { full_name: "owner/repo" },
    subject: { type: "PullRequest", title: "Fix bug" },
  };

  it("formats mention with correct emoji", () => {
    const n = { ...baseNotification, reason: "mention" };
    const { text, parseMode } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.equal(parseMode, "HTML");
    assert.ok(text.includes("💬"));
    assert.ok(text.includes("Mention"));
    assert.ok(text.includes("owner/repo"));
    assert.ok(text.includes("Fix bug"));
    assert.ok(text.includes("https://github.com/owner/repo/pull/1"));
  });

  it("formats review_requested with correct emoji", () => {
    const n = { ...baseNotification, reason: "review_requested" };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("👀"));
    assert.ok(text.includes("Review requested"));
  });

  it("formats comment with correct emoji", () => {
    const n = { ...baseNotification, reason: "comment" };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("🗨️"));
    assert.ok(text.includes("Comment"));
  });

  it("formats assign with correct emoji", () => {
    const n = { ...baseNotification, reason: "assign" };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("📌"));
    assert.ok(text.includes("Assigned"));
  });

  it("handles unknown reason with fallback emoji", () => {
    const n = { ...baseNotification, reason: "something_new" };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("🔔"));
    assert.ok(text.includes("something_new"));
  });

  it("escapes HTML in title", () => {
    const n = {
      ...baseNotification,
      reason: "mention",
      subject: { type: "PullRequest", title: "Fix <script> & stuff" },
    };
    const { text } = formatNotification(n, "https://github.com/owner/repo/pull/1");

    assert.ok(text.includes("&lt;script&gt;"));
    assert.ok(text.includes("&amp;"));
    assert.ok(!text.includes("<script>"));
  });
});
