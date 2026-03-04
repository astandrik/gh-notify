import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { load, save, DEFAULT_SUBSCRIPTIONS } from "./store.js";

const DATA_DIR = "data";
const STATE_FILE = "data/state.json";

describe("store", () => {
  beforeEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  // ─── default state ──────────────────────────────────────────────

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

  it("default subscriptions match the exported constant", async () => {
    const state = await load();
    assert.deepEqual(state.subscriptions, DEFAULT_SUBSCRIPTIONS);
  });

  // ─── env overrides ─────────────────────────────────────────────

  it("merges env overrides into default state", async () => {
    const state = await load({ ghToken: "gh_test_token", chatId: "12345" });
    assert.equal(state.githubToken, "gh_test_token");
    assert.equal(state.chatId, "12345");
  });

  it("does not overwrite existing token with env override", async () => {
    const state = await load();
    state.githubToken = "existing_token";
    await save(state);

    const loaded = await load({ ghToken: "new_env_token" });
    assert.equal(loaded.githubToken, "existing_token");
  });

  it("does not overwrite existing chatId with env override", async () => {
    const state = await load();
    state.chatId = "111";
    await save(state);

    const loaded = await load({ chatId: "222" });
    assert.equal(loaded.chatId, "111");
  });

  it("applies env override when stored value is null", async () => {
    const state = await load();
    state.githubToken = null;
    await save(state);

    const loaded = await load({ ghToken: "from_env" });
    assert.equal(loaded.githubToken, "from_env");
  });

  it("ignores empty string env overrides", async () => {
    const state = await load({ ghToken: "", chatId: "" });
    assert.equal(state.githubToken, null);
    assert.equal(state.chatId, null);
  });

  // ─── save and load ─────────────────────────────────────────────

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

  it("preserves all fields through save/load cycle", async () => {
    const state = await load();
    state.chatId = "42";
    state.githubToken = "ghp_xxx";
    state.lastModified = "Thu, 01 Jan 2026 00:00:00 GMT";
    state.seenIds = ["n1", "n2"];
    state.subscriptions = ["mention", "assign"];
    state.enabled = false;
    await save(state);

    const loaded = await load();
    assert.equal(loaded.chatId, "42");
    assert.equal(loaded.githubToken, "ghp_xxx");
    assert.equal(loaded.lastModified, "Thu, 01 Jan 2026 00:00:00 GMT");
    assert.deepEqual(loaded.seenIds, ["n1", "n2"]);
    assert.deepEqual(loaded.subscriptions, ["mention", "assign"]);
    assert.equal(loaded.enabled, false);
  });

  it("atomic write: state.json is valid JSON after save", async () => {
    const state = await load();
    state.chatId = "42";
    await save(state);

    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.chatId, "42");
  });

  it("overwrites previous state on subsequent saves", async () => {
    const state = await load();
    state.chatId = "first";
    await save(state);

    state.chatId = "second";
    await save(state);

    const loaded = await load();
    assert.equal(loaded.chatId, "second");
  });

  // ─── corrupted / malformed file recovery ────────────────────────

  it("recovers from corrupted JSON file", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, "{invalid json!!!", "utf-8");

    const state = await load();

    assert.equal(state.chatId, null);
    assert.equal(state.enabled, true);
    assert.deepEqual(state.subscriptions, DEFAULT_SUBSCRIPTIONS);
  });

  it("recovers from empty file", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, "", "utf-8");

    const state = await load();

    assert.equal(state.chatId, null);
    assert.equal(state.enabled, true);
  });

  it("recovers from file with just whitespace", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, "   \n  ", "utf-8");

    const state = await load();

    assert.equal(state.chatId, null);
    assert.equal(state.enabled, true);
  });

  // ─── field repair / migration ───────────────────────────────────

  it("repairs missing subscriptions array", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify({ chatId: "1" }), "utf-8");

    const state = await load();

    assert.deepEqual(state.subscriptions, DEFAULT_SUBSCRIPTIONS);
  });

  it("preserves empty subscriptions array (user cleared all)", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ chatId: "1", subscriptions: [] }),
      "utf-8",
    );

    const state = await load();

    assert.deepEqual(state.subscriptions, []);
  });

  it("repairs missing enabled field", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify({ chatId: "1" }), "utf-8");

    const state = await load();
    assert.equal(state.enabled, true);
  });

  it("preserves enabled=false from file", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ chatId: "1", enabled: false, subscriptions: ["mention"] }),
      "utf-8",
    );

    const state = await load();
    assert.equal(state.enabled, false);
  });

  it("repairs seenIds when not an array", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ chatId: "1", seenIds: "not-an-array", subscriptions: ["mention"] }),
      "utf-8",
    );

    const state = await load();
    assert.deepEqual(state.seenIds, []);
  });

  it("repairs seenIds when null", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ chatId: "1", seenIds: null, subscriptions: ["mention"] }),
      "utf-8",
    );

    const state = await load();
    assert.deepEqual(state.seenIds, []);
  });

  // ─── directory creation ─────────────────────────────────────────

  it("creates data directory on load if missing", async () => {
    await rm(DATA_DIR, { recursive: true, force: true });

    const state = await load();
    assert.ok(state); // load succeeds

    state.chatId = "test";
    await save(state);

    const raw = await readFile(STATE_FILE, "utf-8");
    assert.ok(raw.includes("test"));
  });

  it("creates data directory on save if missing", async () => {
    await rm(DATA_DIR, { recursive: true, force: true });

    const state = { chatId: "x", enabled: true, subscriptions: ["mention"], seenIds: [] };
    await save(state);

    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.chatId, "x");
  });
});
