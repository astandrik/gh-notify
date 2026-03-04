import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
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
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      state = getDefault();
    } else {
      throw error;
    }
  }

  if (envOverrides.ghToken && !state.githubToken) {
    state.githubToken = envOverrides.ghToken;
  }
  if (envOverrides.chatId && !state.chatId) {
    state.chatId = envOverrides.chatId;
  }

  if (!Array.isArray(state.subscriptions)) {
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

let saveQueue = Promise.resolve();

async function writeState(serialized) {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  const tmp = `${STATE_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, serialized, "utf-8");
  await rename(tmp, STATE_PATH);
}

export function save(state) {
  const serialized = JSON.stringify(state, null, 2);

  saveQueue = saveQueue.then(
    () => writeState(serialized),
    () => writeState(serialized),
  );

  return saveQueue;
}

export { DEFAULT_SUBSCRIPTIONS };
