import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { load, save } from "./store.js";

const DATA_DIR = "data";

describe("store", () => {
  beforeEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  it("returns default state when no file exists", async () => {
    const state = await load();
    assert.equal(state.chatId, null);
    assert.equal(state.githubToken, null);
    assert.equal(state.lastModified, null);
    assert.deepEqual(state.seenIds, []);
    assert.ok(state.subscriptions.includes("mention"));
    assert.ok(state.subscriptions.includes("review_requested"));
    assert.ok(state.subscriptions.includes("comment"));
    assert.ok(state.subscriptions.includes("assign"));
    assert.equal(state.enabled, true);
  });

  it("merges env overrides into default state", async () => {
    const state = await load({ ghToken: "gh_test_token", chatId: "12345" });
    assert.equal(state.githubToken, "gh_test_token");
    assert.equal(state.chatId, "12345");
  });

  it("saves and loads state correctly", async () => {
    const state = await load();
    state.chatId = "999";
    state.githubToken = "gh_saved";
    state.seenIds = ["a", "b", "c"];

    await save(state);

    const loaded = await load();
    assert.equal(loaded.chatId, "999");
    assert.equal(loaded.githubToken, "gh_saved");
    assert.deepEqual(loaded.seenIds, ["a", "b", "c"]);
  });

  it("does not overwrite existing token with env override", async () => {
    const state = await load();
    state.githubToken = "existing_token";
    await save(state);

    const loaded = await load({ ghToken: "new_env_token" });
    assert.equal(loaded.githubToken, "existing_token");
  });

  it("atomic write: state.json is valid JSON after save", async () => {
    const state = await load();
    state.chatId = "42";
    await save(state);

    const raw = await readFile("data/state.json", "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.chatId, "42");
  });
});
