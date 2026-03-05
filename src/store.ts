import { mkdir, writeFile } from "node:fs/promises";
import { JSONFilePreset } from "lowdb/node";
import type { Low } from "lowdb";
import type { AppState, EnvOverrides } from "./types.js";

const STATE_PATH = "data/state.json";

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

let db: Low<AppState> | null = null;

async function getDb(): Promise<Low<AppState>> {
  if (!db) {
    await mkdir("data", { recursive: true });
    try {
      db = await JSONFilePreset<AppState>(STATE_PATH, getDefault());
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        console.warn("[store] Corrupted state.json detected. Resetting to defaults.");
        await writeFile(STATE_PATH, JSON.stringify(getDefault(), null, 2), "utf-8");
        db = await JSONFilePreset<AppState>(STATE_PATH, getDefault());
      } else {
        throw error;
      }
    }
  }
  return db;
}

function isValidState(data: unknown): data is AppState {
  return data !== null && typeof data === "object" && !Array.isArray(data);
}

function repair(state: AppState): void {
  if (!Array.isArray(state.subscriptions)) {
    state.subscriptions = [...DEFAULT_SUBSCRIPTIONS];
  }
  if (state.enabled === undefined) {
    state.enabled = true;
  }
  if (!Array.isArray(state.seenIds)) {
    state.seenIds = [];
  }
}

function applyOverrides(state: AppState, overrides: EnvOverrides): void {
  if (overrides.ghToken && !state.githubToken) {
    state.githubToken = overrides.ghToken;
  }
  if (overrides.chatId && !state.chatId) {
    state.chatId = overrides.chatId;
  }
}

export async function load(envOverrides: EnvOverrides = {}): Promise<AppState> {
  const instance = await getDb();
  await instance.read();

  if (!isValidState(instance.data)) {
    console.warn("[store] Invalid state.json structure. Resetting to defaults.");
    instance.data = getDefault();
    await instance.write();
  }

  repair(instance.data);
  applyOverrides(instance.data, envOverrides);
  return instance.data;
}

export async function save(state: AppState): Promise<void> {
  const instance = await getDb();
  instance.data = state;
  await instance.write();
}

/** Reset the db singleton (for tests). */
export function resetDb(): void {
  db = null;
}

export { DEFAULT_SUBSCRIPTIONS };
