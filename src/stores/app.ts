import { create } from "zustand";
import {
  AUTO_DELETE_OPTIONS,
  BUILTIN_PROMPT,
  DEFAULT_PROMPT_ID,
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  bestText,
  mergePrompts,
  type AppSettings,
  type Folder,
  type HistoryItem,
  type PromptDoc,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { deleteRecording } from "@/lib/idb";
import { diag } from "@/lib/log";

type FolderScope = "all" | "unfiled" | "custom" | string;

export type VaultSnapshot = {
  settings: AppSettings;
  history: HistoryItem[];
  folders: Folder[];
  prompts: PromptDoc[];
  defaultPromptId: string;
  selectedPromptId: string;
  lastPadPromptId: string;
  pad: string;
  padResult: string;
};

interface AppState {
  hydrated: boolean;
  ownerUserId: string | null;
  settings: AppSettings;
  history: HistoryItem[];
  folders: Folder[];
  prompts: PromptDoc[];
  defaultPromptId: string;
  selectedPromptId: string;
  lastPadPromptId: string;
  pad: string;
  padResult: string;
  selectedId: string | null;
  search: string;
  scope: FolderScope;
  setHydrated: (v: boolean) => void;
  patchSettings: (p: Partial<AppSettings>) => void;
  setPad: (v: string) => void;
  setPadResult: (v: string) => void;
  appendPad: (v: string) => void;
  setSearch: (v: string) => void;
  setScope: (s: FolderScope) => void;
  select: (id: string | null) => void;
  addHistory: (item: HistoryItem) => void;
  updateHistory: (id: string, patch: Partial<HistoryItem>) => void;
  deleteHistory: (id: string) => void;
  moveHistory: (id: string, folderId: string | null) => void;
  addFolder: (name: string) => string | null;
  deleteFolder: (id: string) => void;
  addPrompt: () => string;
  duplicatePrompt: (id: string) => string | null;
  updatePrompt: (id: string, patch: Pick<PromptDoc, "name" | "instructions">) => void;
  deletePrompt: (id: string) => void;
  setDefaultPrompt: (id: string) => void;
  setSelectedPrompt: (id: string) => void;
  setLastPadPrompt: (id: string) => void;
  defaultPrompt: () => PromptDoc;
  promptById: (id?: string | null) => PromptDoc;
  sweepAutoDelete: () => void;
  resetAccount: () => void;
  hydrateCloud: (p: VaultSnapshot, ownerUserId: string) => void;
  snapshot: () => VaultSnapshot;
}

function uniqueFolderName(name: string, folders: Folder[]): boolean {
  const n = name.trim().toLowerCase();
  return !folders.some((f) => f.name.toLowerCase() === n);
}

function uniquePromptName(base: string, prompts: PromptDoc[]): string {
  const names = new Set(prompts.map((p) => p.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) i += 1;
  return `${base} ${i}`;
}

function pickPrompt(prompts: PromptDoc[], id: string | undefined | null): PromptDoc {
  return prompts.find((p) => p.id === id) ?? prompts.find((p) => p.id === DEFAULT_PROMPT_ID) ?? BUILTIN_PROMPT;
}

function normalizeHistory(items: HistoryItem[]): HistoryItem[] {
  return items.map((h) => ({
    ...h,
    source: h.source ?? "recording",
    promptId: h.promptId ?? null,
  }));
}

function emptyAccount(): Pick<
  AppState,
  | "settings"
  | "history"
  | "folders"
  | "prompts"
  | "defaultPromptId"
  | "selectedPromptId"
  | "lastPadPromptId"
  | "pad"
  | "padResult"
  | "selectedId"
  | "search"
  | "scope"
  | "ownerUserId"
> {
  return {
    ownerUserId: null,
    settings: { ...DEFAULT_SETTINGS, theme: { ...DEFAULT_THEME } },
    history: [],
    folders: [],
    prompts: mergePrompts(undefined),
    defaultPromptId: DEFAULT_PROMPT_ID,
    selectedPromptId: DEFAULT_PROMPT_ID,
    lastPadPromptId: DEFAULT_PROMPT_ID,
    pad: "",
    padResult: "",
    selectedId: null,
    search: "",
    scope: "all",
  };
}

export const useApp = create<AppState>()((set, get) => ({
  hydrated: false,
  ...emptyAccount(),
  setHydrated: (v) => set({ hydrated: v }),
  patchSettings: (p) => {
    set((s) => ({
      settings: {
        ...s.settings,
        ...p,
        theme: p.theme ? { ...s.settings.theme, ...p.theme } : s.settings.theme,
      },
    }));
    diag("settings", `updated ${Object.keys(p).join(", ")}`);
  },
  setPad: (v) => set({ pad: v }),
  setPadResult: (v) => set({ padResult: v }),
  appendPad: (v) => {
    const text = v.trim();
    if (!text) return;
    set((s) => ({
      pad: s.pad.trim() ? `${s.pad.replace(/\s+$/, "")}\n\n${text}` : text,
    }));
  },
  setSearch: (v) => set({ search: v }),
  setScope: (scope) => set({ scope, selectedId: null }),
  select: (id) => set({ selectedId: id }),
  addHistory: (item) =>
    set((s) => ({
      history: [item, ...s.history],
      selectedId: item.id,
    })),
  updateHistory: (id, patch) =>
    set((s) => ({
      history: s.history.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    })),
  deleteHistory: (id) => {
    const item = get().history.find((h) => h.id === id);
    if (item?.recordingId) void deleteRecording(item.recordingId);
    set((s) => ({
      history: s.history.filter((h) => h.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },
  moveHistory: (id, folderId) =>
    set((s) => ({
      history: s.history.map((h) => (h.id === id ? { ...h, folderId } : h)),
    })),
  addFolder: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (!uniqueFolderName(trimmed, get().folders)) return null;
    const folder: Folder = { id: uid(), name: trimmed };
    set((s) => ({
      folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return folder.id;
  },
  deleteFolder: (id) =>
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      history: s.history.map((h) => (h.folderId === id ? { ...h, folderId: null } : h)),
      scope: s.scope === id ? "all" : s.scope,
    })),
  addPrompt: () => {
    const id = uid();
    const name = uniquePromptName("Untitled Prompt", get().prompts);
    set((s) => ({
      prompts: [...s.prompts, { id, name, instructions: "", builtIn: false }],
      selectedPromptId: id,
    }));
    return id;
  },
  duplicatePrompt: (id) => {
    const src = get().prompts.find((p) => p.id === id);
    if (!src) return null;
    const nid = uid();
    const name = uniquePromptName(`${src.name} Copy`, get().prompts);
    set((s) => ({
      prompts: [...s.prompts, { id: nid, name, instructions: src.instructions, builtIn: false }],
      selectedPromptId: nid,
    }));
    return nid;
  },
  updatePrompt: (id, patch) =>
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id && !p.builtIn ? { ...p, ...patch } : p)),
    })),
  deletePrompt: (id) => {
    const p = get().prompts.find((x) => x.id === id);
    if (!p || p.builtIn) return;
    set((s) => {
      const prompts = s.prompts.filter((x) => x.id !== id);
      const defaultPromptId = s.defaultPromptId === id ? DEFAULT_PROMPT_ID : s.defaultPromptId;
      const selectedPromptId = s.selectedPromptId === id ? defaultPromptId : s.selectedPromptId;
      const lastPadPromptId = s.lastPadPromptId === id ? defaultPromptId : s.lastPadPromptId;
      return { prompts, defaultPromptId, selectedPromptId, lastPadPromptId };
    });
  },
  setDefaultPrompt: (id) =>
    set((s) => ({
      defaultPromptId: id,
      selectedPromptId: id,
      settings: s.settings.cleanupEnabled ? s.settings : { ...s.settings, cleanupEnabled: true },
    })),
  setSelectedPrompt: (id) => set({ selectedPromptId: id }),
  setLastPadPrompt: (id) => set({ lastPadPromptId: id }),
  defaultPrompt: () => pickPrompt(get().prompts, get().defaultPromptId),
  promptById: (id) => pickPrompt(get().prompts, id ?? get().defaultPromptId),
  sweepAutoDelete: () => {
    const { settings, history } = get();
    if (settings.autoDelete === "never") return;
    const days = Number(settings.autoDelete);
    if (!Number.isFinite(days)) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const keep: HistoryItem[] = [];
    for (const h of history) {
      if (new Date(h.createdAt).getTime() < cutoff) {
        if (h.recordingId) void deleteRecording(h.recordingId);
      } else {
        keep.push(h);
      }
    }
    if (keep.length !== history.length) set({ history: keep });
  },
  snapshot: () => {
    const s = get();
    return {
      settings: s.settings,
      history: s.history,
      folders: s.folders,
      prompts: s.prompts,
      defaultPromptId: s.defaultPromptId,
      selectedPromptId: s.selectedPromptId,
      lastPadPromptId: s.lastPadPromptId,
      pad: s.pad,
      padResult: s.padResult,
    };
  },
  resetAccount: () => set({ ...emptyAccount() }),
  hydrateCloud: (p, ownerUserId) => {
    const prompts = mergePrompts(p.prompts);
    const saved = (p.settings ?? {}) as Partial<AppSettings>;
    const defaultPromptId = prompts.some((x) => x.id === p.defaultPromptId)
      ? p.defaultPromptId
      : DEFAULT_PROMPT_ID;
    const selectedPromptId = prompts.some((x) => x.id === p.selectedPromptId)
      ? p.selectedPromptId
      : defaultPromptId;
    const lastPadPromptId = prompts.some((x) => x.id === p.lastPadPromptId)
      ? p.lastPadPromptId
      : defaultPromptId;
    set({
      ownerUserId,
      settings: {
        ...DEFAULT_SETTINGS,
        ...saved,
        theme: { ...DEFAULT_THEME, ...(saved.theme ?? {}) },
        themeId: saved.themeId ?? "signal",
        launchAction: saved.launchAction ?? "idle",
        cleanupEnabled: true,
      },
      prompts,
      defaultPromptId,
      selectedPromptId,
      lastPadPromptId,
      pad: typeof p.pad === "string" ? p.pad : "",
      padResult: typeof p.padResult === "string" ? p.padResult : "",
      history: normalizeHistory(Array.isArray(p.history) ? p.history : []),
      folders: p.folders ?? [],
      selectedId: null,
      search: "",
      scope: "all",
    });
  },
}));

export function visibleHistory(): HistoryItem[] {
  const { history, scope, search } = useApp.getState();
  const q = search.trim().toLowerCase();
  return history.filter((h) => {
    if (h.archived) return false;
    if (scope === "custom") {
      if (h.source !== "custom") return false;
    } else if (scope === "unfiled") {
      if (h.folderId || h.source === "custom") return false;
    } else if (scope !== "all" && h.folderId !== scope) {
      return false;
    }
    if (!q) return true;
    const hay = [h.raw, h.cleaned ?? "", h.promptName ?? "", h.engine].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function counts() {
  const { history, folders } = useApp.getState();
  const active = history.filter((h) => !h.archived);
  return {
    all: active.length,
    unfiled: active.filter((h) => !h.folderId && h.source !== "custom").length,
    custom: active.filter((h) => h.source === "custom").length,
    folders: folders.map((f) => ({
      ...f,
      count: active.filter((h) => h.folderId === f.id).length,
    })),
  };
}

export { AUTO_DELETE_OPTIONS, bestText };
