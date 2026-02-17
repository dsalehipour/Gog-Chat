export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolExecution[];
  timestamp: number;
}

export interface ToolExecution {
  command: string;
  output: string;
  success: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  starred?: boolean;
  archived?: boolean;
  driveFileId?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  apiKey: string;
  model: string;
  gogAccount: string;
  customModels: string[];
}

export const DEFAULT_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "claude-opus-4-6",
  gogAccount: "",
  customModels: [],
};
