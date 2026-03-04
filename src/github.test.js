import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHtmlUrl } from "./github.js";

describe("buildHtmlUrl", () => {
  it("converts pull request API URL to HTML URL", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "PullRequest",
        url: "https://api.github.com/repos/owner/repo/pulls/42",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/pull/42");
  });

  it("converts issue API URL to HTML URL", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "Issue",
        url: "https://api.github.com/repos/owner/repo/issues/123",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/issues/123");
  });

  it("converts commit API URL to HTML URL", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "Commit",
        url: "https://api.github.com/repos/owner/repo/commits/abc123def",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/commit/abc123def");
  });

  it("converts release to releases page", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "Release",
        url: "https://api.github.com/repos/owner/repo/releases/99",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/releases");
  });

  it("handles Discussion type", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "Discussion",
        url: "",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo/discussions");
  });

  it("falls back to repo URL for unknown types", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: {
        type: "Unknown",
        url: "https://api.github.com/repos/owner/repo/something/else",
      },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo");
  });

  it("falls back when subject.url is missing", () => {
    const n = {
      repository: { full_name: "owner/repo" },
      subject: { type: "PullRequest" },
    };
    assert.equal(buildHtmlUrl(n), "https://github.com/owner/repo");
  });
});
