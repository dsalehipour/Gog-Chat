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

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

export interface FollowUp {
  id: string;
  title: string;
  source: "email" | "calendar" | "task" | "manual" | "conversation";
  sourceUrl?: string;
  threadId?: string;
  dueDate?: number;
  status: "pending" | "done" | "snoozed" | "dismissed";
  notes?: string;
  contactName?: string;
  contactEmail?: string;
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineSchedule {
  type: "once" | "daily" | "weekly" | "monthly";
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  onceDate?: string;
}

export interface Routine {
  id: string;
  instruction: string;
  schedule: RoutineSchedule;
  enabled: boolean;
  lastRun?: number;
  nextRun: number;
  conversationIds: string[];
  createdAt: number;
}

export interface EmailStyleProfile {
  tone: string;
  greetingPatterns: string[];
  signOffPatterns: string[];
  vocabularyNotes: string;
  sentenceLengthTendency: string;
  formalityLevel: string;
  raw: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  gogAccount: string;
  customModels: string[];
  maxTokens: number;
  maxIterations: number;
  maxContextChars: number;
  systemPrompt: string;
  driveSyncEnabled: boolean;
  briefingRefreshMinutes: number;
  briefingStaleMinutes: number;
  quickActions: QuickAction[];
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa-unread", label: "Unread emails", prompt: "Summarize my unread emails from today. Highlight anything urgent.", icon: "Mail" },
  { id: "qa-schedule", label: "Today's schedule", prompt: "What events do I have on my calendar today? Include times and locations.", icon: "Calendar" },
  { id: "qa-tasks", label: "Open tasks", prompt: "Show all my open tasks across all task lists.", icon: "CheckSquare" },
  { id: "qa-recent", label: "Recent files", prompt: "List my 10 most recently opened Google Drive files.", icon: "HardDrive" },
  { id: "qa-reply", label: "Draft a reply", prompt: "Find my most recent unread email that needs a reply and draft a response for me.", icon: "Reply" },
];

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
  maxTokens: 16384,
  maxIterations: 40,
  maxContextChars: 180_000,
  systemPrompt: "",
  driveSyncEnabled: true,
  briefingRefreshMinutes: 60,
  briefingStaleMinutes: 2,
  quickActions: DEFAULT_QUICK_ACTIONS,
};
