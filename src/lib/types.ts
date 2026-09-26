export type FlowState =
  | "idle"
  | "preparing"
  | "recording"
  | "paused"
  | "transcribing"
  | "cleaning"
  | "complete"
  | "cleanup-failed"
  | "no-speech"
  | "error";

export type FlowTrigger = "shortcut" | "wake" | "menu" | "manual" | "overlay" | "recover";

export type HistorySource = "recording" | "custom";

export type HistoryStatus = "complete" | "cleanup-failed" | "no-speech" | "error";

export type SoundPreset =
  "electronic" | "high" | "metallic" | "metallic-tiny" | "double-chime" | "double";

export type AutoDelete = "never" | "7" | "30" | "90" | "365";

export type TranscribeEngine = "grok" | "whisper" | "browser";

export type OverlayMode = "modal" | "float";

export type LaunchAction = "idle" | "record";

export type WhisperModelId =
  "tiny.en" | "base.en" | "small.en" | "medium.en" | "large-v2" | "large-v3" | "large-v3-turbo";

export type ProviderId =
  | "openai"
  | "groq"
  | "mistral"
  | "deepseek"
  | "xai"
  | "together"
  | "fireworks"
  | "openrouter"
  | "perplexity"
  | "gemini"
  | "custom"
  | "local";

export interface Shortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface ThemeColors {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  foreground: string;
  success: string;
  danger: string;
}

export interface AppSettings {
  microphoneId: string;
  keepMicIdle: boolean;
  wakeEnabled: boolean;
  wakePhrase: string;
  sendEnabled: boolean;
  sendPhrase: string;
  requiredSilence: number;
  insertEnabled: boolean;
  insertPhrase: string;
  autoInsert: boolean;
  shortcut: Shortcut;
  soundsEnabled: boolean;
  soundPreset: SoundPreset;
  soundVolume: number;
  transcribeEngine: TranscribeEngine;
  whisperModel: WhisperModelId;
  cleanupEnabled: boolean;
  provider: ProviderId;
  model: string;
  customEndpoint: string;
  /** Legacy field retained only so old vaults can be scrubbed during their next save. */
  customApiKey: string;
  localToolId: string;
  keepOverlayOpen: boolean;
  overlayMode: OverlayMode;
  floatX: number;
  floatY: number;
  autoDelete: AutoDelete;
  diagnosticLogging: boolean;
  onboardingDone: boolean;
  theme: ThemeColors;
  themeId: string;
  launchAction: LaunchAction;
}

export interface CleanupExchange {
  provider: string;
  model: string;
  endpoint: string;
  requestAt: string;
  responseAt: string;
  httpStatus: number;
  requestJson: string;
  responseJson: string;
}

export interface HistoryItem {
  id: string;
  createdAt: string;
  raw: string;
  cleaned: string | null;
  promptName: string | null;
  promptId?: string | null;
  recordingId: string | null;
  folderId: string | null;
  archived: boolean;
  status: HistoryStatus;
  source: HistorySource;
  cleanupFailure?: string;
  engine: string;
  previousRaw: string[];
  exchange?: CleanupExchange | null;
}

export interface Folder {
  id: string;
  name: string;
}

export interface PromptDoc {
  id: string;
  name: string;
  instructions: string;
  builtIn: boolean;
}

export interface LogEntry {
  id: string;
  t: string;
  cat: string;
  msg: string;
}

export interface MicInfo {
  deviceId: string;
  label: string;
}

export { DEFAULT_PROMPT_ID, BUILTIN_PROMPT, BUILTIN_PROMPTS, mergePrompts } from "./prompts";

export const DEFAULT_SHORTCUT: Shortcut = {
  key: "v",
  meta: true,
  ctrl: false,
  alt: false,
  shift: true,
};

export const DEFAULT_THEME: ThemeColors = {
  primary: "#F5D90A",
  accent: "#F5D90A",
  background: "#000000",
  surface: "#111111",
  foreground: "#FAFAFA",
  success: "#4ADE80",
  danger: "#FF5C5C",
};

export const DEFAULT_SETTINGS: AppSettings = {
  microphoneId: "",
  keepMicIdle: false,
  wakeEnabled: false,
  wakePhrase: "Ok Voice",
  sendEnabled: true,
  sendPhrase: "OK, send",
  requiredSilence: 2,
  insertEnabled: true,
  insertPhrase: "Insert",
  autoInsert: false,
  shortcut: DEFAULT_SHORTCUT,
  soundsEnabled: true,
  soundPreset: "electronic",
  soundVolume: 0.7,
  transcribeEngine: "grok",
  whisperModel: "base.en",
  cleanupEnabled: true,
  provider: "xai",
  model: "grok-4.5",
  customEndpoint: "",
  customApiKey: "",
  localToolId: "",
  keepOverlayOpen: false,
  overlayMode: "modal",
  floatX: 24,
  floatY: 24,
  autoDelete: "never",
  diagnosticLogging: true,
  onboardingDone: false,
  theme: DEFAULT_THEME,
  themeId: "signal",
  launchAction: "idle",
};

export const SOUND_PRESETS: { id: SoundPreset; label: string }[] = [
  { id: "electronic", label: "Electronic" },
  { id: "high", label: "High" },
  { id: "metallic", label: "Metallic" },
  { id: "metallic-tiny", label: "Metallic Tiny" },
  { id: "double-chime", label: "Double Chime" },
  { id: "double", label: "Double" },
];

export const WHISPER_MODELS: {
  id: WhisperModelId;
  label: string;
  hf: string;
  sizeMB: number;
  note: string;
}[] = [
  {
    id: "tiny.en",
    label: "Tiny",
    hf: "Xenova/whisper-tiny.en",
    sizeMB: 39,
    note: "Fastest · English",
  },
  {
    id: "base.en",
    label: "Base",
    hf: "Xenova/whisper-base.en",
    sizeMB: 77,
    note: "Recommended · English",
  },
  {
    id: "small.en",
    label: "Small",
    hf: "Xenova/whisper-small.en",
    sizeMB: 244,
    note: "Better accuracy · English",
  },
  {
    id: "medium.en",
    label: "Medium",
    hf: "Xenova/whisper-medium.en",
    sizeMB: 769,
    note: "Heavy · English",
  },
  {
    id: "large-v2",
    label: "Large v2",
    hf: "Xenova/whisper-large-v2",
    sizeMB: 1550,
    note: "Multilingual · large download",
  },
  {
    id: "large-v3",
    label: "Large v3",
    hf: "Xenova/whisper-large-v3",
    sizeMB: 1550,
    note: "Multilingual · large download",
  },
  {
    id: "large-v3-turbo",
    label: "Large v3 Turbo",
    hf: "onnx-community/whisper-large-v3-turbo",
    sizeMB: 1035,
    note: "Faster large · multilingual",
  },
];

export const LOCAL_TOOLS: { id: string; bin: string; label: string; hint: string }[] = [
  { id: "codex", bin: "codex", label: "Codex CLI", hint: "OpenAI Codex command line" },
  { id: "claude", bin: "claude", label: "Claude Code", hint: "Anthropic Claude CLI" },
  { id: "grok", bin: "grok", label: "Grok CLI", hint: "xAI Grok command line" },
  { id: "ollama", bin: "ollama", label: "Ollama", hint: "Local models via ollama run" },
  { id: "gemini", bin: "gemini", label: "Gemini CLI", hint: "Google Gemini command line" },
  { id: "cursor", bin: "cursor", label: "Cursor", hint: "Cursor editor CLI" },
  { id: "aider", bin: "aider", label: "Aider", hint: "Aider coding assistant" },
  { id: "gt", bin: "gt", label: "Graphite CLI", hint: "gt stacked-diff tool" },
  { id: "gh", bin: "gh", label: "GitHub CLI", hint: "gh command line" },
];

export const AUTO_DELETE_OPTIONS: { id: AutoDelete; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "365", label: "1 year" },
];

export const THEME_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "foreground", label: "Foreground" },
  { key: "success", label: "Success" },
  { key: "danger", label: "Danger" },
];

export function bestText(item: HistoryItem): string {
  const cleaned = item.cleaned?.trim();
  if (cleaned) return cleaned;
  return item.raw.trim();
}

export function previewText(item: HistoryItem, max = 140): string {
  const t = bestText(item).replace(/\s+/g, " ").trim();
  if (!t) {
    if (item.status === "no-speech") return "No speech detected";
    if (item.status === "error") return item.cleanupFailure || "Error";
    return "Empty transcript";
  }
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
