import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AppState, EnvOverrides } from "./types.js";

const STATE_PATH: string = resolve("data", "state.json");

const DEFAULT_SUBSCRIPTIONS: string[] = [
  "mention",
  "review_requested",
  "comment",
  "assign",
];

function getDefault(): AppState {
  return {
    chatId: null,
    githubToken: null,
    lastModified: null,
    seenIds: [],
    subscriptions: [...DEFAULT_SUBSCRIPTIONS],
    enabled: true,
  };
}

export async function load(envOverrides: EnvOverrides = {}): Promise<AppState> {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  let state: AppState;
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    state = JSON.parse(raw) as AppState;
  } catch (error: unknown) {
    const isNotFound =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";

    if (isNotFound || error instanceof SyntaxError) {
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

let saveQueue: Promise<void> = Promise.resolve();

async function writeState(serialized: string): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  const tmp = `${STATE_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, serialized, "utf-8");
  await rename(tmp, STATE_PATH);
}

export function save(state: AppState): Promise<void> {
  const serialized = JSON.stringify(state, null, 2);

  saveQueue = saveQueue.then(
    () => writeState(serialized),
    () => writeState(serialized),
  );

  return saveQueue;
}

export { DEFAULT_SUBSCRIPTIONS };
