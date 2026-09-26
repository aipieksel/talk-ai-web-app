import { WHISPER_MODELS, type WhisperModelId } from "./types";
import { diag } from "./log";

export type WhisperPhase = "idle" | "checking" | "downloading" | "loading" | "ready" | "error";

export interface WhisperState {
  phase: WhisperPhase;
  modelId: WhisperModelId | null;
  progress: number;
  message: string;
  error: string;
}

type Listener = (s: WhisperState) => void;

let state: WhisperState = {
  phase: "idle",
  modelId: null,
  progress: 0,
  message: "",
  error: "",
};

const listeners = new Set<Listener>();
let resident: { id: WhisperModelId; pipe: WhisperPipe } | null = null;
let loadToken = 0;

type WhisperPipe = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text?: string }>;

function emit() {
  for (const l of listeners) l(state);
}

export function getWhisperState(): WhisperState {
  return state;
}

export function subscribeWhisper(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function cacheFlag(id: WhisperModelId) {
  return `walkie-whisper-ready:${id}`;
}

export function isWhisperMarkedReady(id: WhisperModelId): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(cacheFlag(id)) === "1";
}

export function whisperResident(): WhisperModelId | null {
  return resident?.id ?? null;
}

export async function isWhisperCached(id: WhisperModelId): Promise<boolean> {
  if (isWhisperMarkedReady(id)) return true;
  if (typeof caches === "undefined") return false;
  const hf = WHISPER_MODELS.find((m) => m.id === id)?.hf ?? "";
  const needle = hf.split("/")[1] ?? hf;
  try {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((k) => k.url.includes(needle) || k.url.includes(hf))) return true;
    }
  } catch {
    /* */
  }
  return false;
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

export async function ensureWhisper(id: WhisperModelId): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Whisper runs in the browser.");
  }
  if (resident?.id === id) {
    state = { phase: "ready", modelId: id, progress: 100, message: "Ready", error: "" };
    emit();
    return;
  }
  const token = ++loadToken;
  const meta = WHISPER_MODELS.find((m) => m.id === id);
  if (!meta) throw new Error("Unknown Whisper model.");

  const cached = await isWhisperCached(id);
  state = {
    phase: cached ? "loading" : "downloading",
    modelId: id,
    progress: cached ? 8 : 0,
    message: cached ? "Loading into memory…" : `Downloading ${meta.label} (${meta.sizeMB} MB)…`,
    error: "",
  };
  emit();

  try {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const pipe = await pipeline("automatic-speech-recognition", meta.hf, {
      progress_callback: (p: {
        status?: string;
        progress?: number;
        loaded?: number;
        total?: number;
        file?: string;
      }) => {
        if (token !== loadToken) return;
        const frac =
          typeof p.progress === "number"
            ? p.progress / 100
            : p.total
              ? (p.loaded ?? 0) / p.total
              : 0;
        const pct = Math.max(1, Math.min(97, Math.round(frac * 100)));
        const downloading = p.status === "progress" || p.status === "download" || p.status === "initiate";
        state = {
          phase: downloading && !cached ? "downloading" : "loading",
          modelId: id,
          progress: pct,
          message: downloading && !cached ? `Downloading ${p.file ?? meta.label}…` : "Loading into memory…",
          error: "",
        };
        emit();
      },
    });

    if (token !== loadToken) return;
    resident = { id, pipe: pipe as unknown as WhisperPipe };
    try {
      localStorage.setItem(cacheFlag(id), "1");
    } catch {
      /* */
    }
    state = { phase: "ready", modelId: id, progress: 100, message: "Ready", error: "" };
    emit();
    diag("transcription", `whisper ${id} ready`);
  } catch (e) {
    if (token !== loadToken) return;
    const message = e instanceof Error ? e.message : "Could not load Whisper.";
    state = { phase: "error", modelId: id, progress: 0, message: "", error: message };
    emit();
    diag("transcription", `whisper load failed: ${message}`);
    throw e;
  }
}

export async function transcribeWhisper(blob: Blob, id: WhisperModelId): Promise<string> {
  await ensureWhisper(id);
  if (!resident || resident.id !== id) throw new Error("Whisper model is not ready.");
  const audio = await decodeToMono16k(blob);
  const result = await resident.pipe(audio, {
    language: "english",
    task: "transcribe",
    return_timestamps: false,
  });
  return (result.text ?? "").trim();
}

export function preloadWhisperIfCached(id: WhisperModelId) {
  if (typeof window === "undefined") return;
  void (async () => {
    const cached = await isWhisperCached(id);
    if (!cached) {
      state = {
        phase: "idle",
        modelId: id,
        progress: 0,
        message: "Not downloaded yet",
        error: "",
      };
      emit();
      return;
    }
    try {
      await ensureWhisper(id);
    } catch {
      /* surfaced in state */
    }
  })();
}
