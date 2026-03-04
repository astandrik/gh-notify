import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STATE_PATH = resolve("data", "state.json");

const DEFAULT_SUBSCRIPTIONS = [
  "mention",
  "review_requested",
  "comment",
  "assign",
];

function getDefault() {
  return {
    chatId: null,
    githubToken: null,
    lastModified: null,
    seenIds: [],
    subscriptions: [...DEFAULT_SUBSCRIPTIONS],
    enabled: true,
  };
}

export async function load(envOverrides = {}) {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  let state;
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    state = JSON.parse(raw);
  } catch {
    state = getDefault();
  }

  if (envOverrides.ghToken && !state.githubToken) {
    state.githubToken = envOverrides.ghToken;
  }
  if (envOverrides.chatId && !state.chatId) {
    state.chatId = envOverrides.chatId;
  }

  if (!state.subscriptions || !state.subscriptions.length) {
    state.subscriptions = [...DEFAULT_SUBSCRIPTIONS];
  }
  if (state.enabled === undefined) {
    state.enabled = true;
  }
  if (!Array.isArray(state.seenIds)) {
    state.seenIds = [];
  }

  return state;
}

export async function save(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  const tmp = STATE_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");

  const { rename } = await import("node:fs/promises");
  await rename(tmp, STATE_PATH);
}

export { DEFAULT_SUBSCRIPTIONS };
