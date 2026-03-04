export interface AppState {
  chatId: string | null;
  githubToken: string | null;
  lastModified: string | null;
  seenIds: string[];
  subscriptions: string[];
  enabled: boolean;
}

export interface EnvOverrides {
  ghToken?: string;
  chatId?: string;
}

export interface AppConfig {
  readonly tgBotToken: string;
  readonly ghToken: string;
  readonly chatId: string;
  readonly pollInterval: number;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  repository?: {
    full_name: string;
  };
  subject?: {
    type: string;
    title: string;
    url: string;
  };
}

export interface FetchResult {
  notifications: GitHubNotification[];
  lastModified: string | null;
}

export interface TokenValidation {
  valid: boolean;
  login?: string;
}

export interface FormattedMessage {
  text: string;
  parseMode: "HTML";
}
