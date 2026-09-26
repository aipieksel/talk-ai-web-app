import { create } from "zustand";
import { toast } from "sonner";
import { sessionFields } from "@/lib/lock-client";
import { runCleanup } from "@/lib/cleanup-client";
import { transcribeAudio, whisperModelStatus } from "@/lib/server/ai";
import {
  blobFromDraft,
  deleteDraft,
  loadDraft,
  saveDraft,
  saveRecording,
  type AudioDraft,
} from "@/lib/idb";
import { diag } from "@/lib/log";
import { postNativeWidget } from "@/lib/native-widget";
import { phraseHeard } from "@/lib/phrases";
import { playSignal, unlockAudio } from "@/lib/sounds";
import {
  blobToBase64,
  createRecognizer,
  filenameForMime,
  pickRecorderMime,
  speechAvailable,
} from "@/lib/speech";
import type { CleanupExchange, FlowState, FlowTrigger, HistoryItem } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useApp } from "./app";

const WAVE_HZ = 18;
const WAVE_MAX = 720;
const SPEECH_FLOOR = 0.0316;
// Local Whisper processes long recordings in overlapping 30 second chunks.
// Keep the client alive longer than the server-side ceiling so a completed
// server job can never be discarded in favour of the browser's live preview.
const TRANSCRIPTION_TIMEOUT_MS = 620_000;

type Recog = ReturnType<typeof createRecognizer>;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface RecoveredDraft {
  id: string;
  createdAt: number;
  elapsedMs: number;
  live: string;
  size: number;
}

interface Runtime {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  prefix: Blob[];
  mime: string;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  waveTimer: number | null;
  clockTimer: number | null;
  draftTimer: number | null;
  startedAt: number;
  elapsedOffset: number;
  recog: Recog;
  wake: Recog;
  hasSpoken: boolean;
  silenceMs: number;
  speechHoldMs: number;
  beepSpent: boolean;
  armed: boolean;
  armedUtterance: string;
  liveFinal: string;
  liveInterim: string;
  holdMode: boolean;
  buffersSeen: number;
  healthTimer: number | null;
  sessionId: string;
}

const rt: Runtime = {
  stream: null,
  recorder: null,
  chunks: [],
  prefix: [],
  mime: "",
  ctx: null,
  analyser: null,
  source: null,
  waveTimer: null,
  clockTimer: null,
  draftTimer: null,
  startedAt: 0,
  elapsedOffset: 0,
  recog: null,
  wake: null,
  hasSpoken: false,
  silenceMs: 0,
  speechHoldMs: 0,
  beepSpent: false,
  armed: false,
  armedUtterance: "",
  liveFinal: "",
  liveInterim: "",
  holdMode: false,
  buffersSeen: 0,
  healthTimer: null,
  sessionId: "",
};

interface VoiceState {
  flow: FlowState;
  trigger: FlowTrigger;
  elapsedMs: number;
  waveform: number[];
  live: string;
  raw: string;
  finalText: string;
  error: string;
  workStatus: string;
  workProgress: number | null;
  armed: boolean;
  itemId: string | null;
  wakeStatus: "off" | "listening" | "paused" | "missing-permission" | "unavailable" | "error";
  exchange: CleanupExchange | null;
  recovered: RecoveredDraft | null;
  start: (trigger: FlowTrigger, hold?: boolean) => Promise<void>;
  done: () => Promise<void>;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  dismiss: () => void;
  setFinalText: (v: string) => void;
  copy: () => Promise<void>;
  insert: () => Promise<void>;
  share: () => Promise<void>;
  retryCleanup: () => Promise<void>;
  retranscribe: (id: string) => Promise<void>;
  reclean: (id: string, promptId?: string) => Promise<void>;
  pointerUp: () => void;
  syncWake: () => void;
  loadRecovered: () => Promise<void>;
  finishRecovered: () => Promise<void>;
  continueRecovered: () => Promise<void>;
  discardRecovered: () => Promise<void>;
}

function signal(kind: "one" | "double" = "one") {
  const s = useApp.getState().settings;
  if (!s.soundsEnabled) return;
  playSignal(s.soundPreset, s.soundVolume, kind);
}

function setLive() {
  const text = `${rt.liveFinal} ${rt.liveInterim}`.replace(/\s+/g, " ").trim();
  useVoice.setState({ live: text, armed: rt.armed });
}

function currentElapsed() {
  if (useVoice.getState().flow === "paused") return useVoice.getState().elapsedMs;
  if (!rt.startedAt) return rt.elapsedOffset;
  return rt.elapsedOffset + (performance.now() - rt.startedAt);
}

function allChunks(): Blob[] {
  return [...rt.prefix, ...rt.chunks];
}

async function persistDraftNow() {
  if (!rt.sessionId) return;
  const chunks = allChunks();
  if (!chunks.length && !rt.liveFinal) return;
  const draft: AudioDraft = {
    id: rt.sessionId,
    createdAt: Date.now() - currentElapsed(),
    updatedAt: Date.now(),
    mime: rt.mime || "audio/webm",
    live: `${rt.liveFinal} ${rt.liveInterim}`.replace(/\s+/g, " ").trim(),
    elapsedMs: currentElapsed(),
    chunks,
  };
  try {
    await saveDraft(draft);
  } catch (e) {
    diag("audio", `draft save failed: ${String(e)}`);
  }
}

function startDraftLoop() {
  if (rt.draftTimer) clearInterval(rt.draftTimer);
  rt.draftTimer = window.setInterval(() => {
    void persistDraftNow();
  }, 1000) as unknown as number;
}

function stopDraftLoop() {
  if (rt.draftTimer) {
    clearInterval(rt.draftTimer);
    rt.draftTimer = null;
  }
}

function stopClock() {
  if (rt.clockTimer) {
    clearInterval(rt.clockTimer);
    rt.clockTimer = null;
  }
  if (rt.waveTimer) {
    clearInterval(rt.waveTimer);
    rt.waveTimer = null;
  }
  rt.startedAt = 0;
}

function startClock() {
  stopClock();
  rt.startedAt = performance.now();
  rt.waveTimer = window.setInterval(sampleWave, 1000 / WAVE_HZ) as unknown as number;
  rt.clockTimer = window.setInterval(() => {
    useVoice.setState({ elapsedMs: currentElapsed() });
  }, 100) as unknown as number;
}

function teardownCapture(opts?: { keepDraft?: boolean }) {
  stopClock();
  stopDraftLoop();
  if (rt.healthTimer) {
    clearTimeout(rt.healthTimer);
    rt.healthTimer = null;
  }
  try {
    rt.recog?.abort();
  } catch {
    /* */
  }
  rt.recog = null;
  if (rt.recorder && rt.recorder.state !== "inactive") {
    try {
      rt.recorder.stop();
    } catch {
      /* */
    }
  }
  rt.recorder = null;
  rt.source?.disconnect();
  rt.source = null;
  rt.analyser = null;
  if (rt.ctx && rt.ctx.state !== "closed") {
    void rt.ctx.close();
  }
  rt.ctx = null;
  rt.stream?.getTracks().forEach((t) => t.stop());
  rt.stream = null;
  if (!opts?.keepDraft) {
    rt.chunks = [];
    rt.prefix = [];
    rt.sessionId = "";
  }
}

function sampleWave() {
  if (!rt.analyser) return;
  const n = rt.analyser.fftSize;
  const data = new Uint8Array(n);
  rt.analyser.getByteTimeDomainData(data);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / n);
  rt.buffersSeen += 1;
  const energy = rms * 0.7 + peak * 0.3;
  const gated = energy < 0.02 ? 0 : energy;
  const target = Math.min(1, gated * 3.2);
  const prev = useVoice.getState().waveform.at(-1) ?? 0;
  const next = target > prev ? prev + (target - prev) * 0.45 : prev + (target - prev) * 0.12;

  const isSpeech = rms > SPEECH_FLOOR;
  if (isSpeech) {
    if (rt.silenceMs > 50) {
      rt.armedUtterance = "";
      rt.beepSpent = false;
    }
    rt.hasSpoken = true;
    rt.silenceMs = 0;
    rt.speechHoldMs += 1000 / WAVE_HZ;
  } else {
    rt.speechHoldMs = 0;
    if (rt.hasSpoken) {
      rt.silenceMs += 1000 / WAVE_HZ;
    }
  }

  const required = useApp.getState().settings.requiredSilence * 1000;
  if (
    useApp.getState().settings.sendEnabled &&
    rt.hasSpoken &&
    rt.silenceMs >= required &&
    !rt.beepSpent
  ) {
    rt.beepSpent = true;
    rt.armed = true;
    rt.armedUtterance = "";
    signal("one");
    diag("send phrase", "armed after silence");
  }

  useVoice.setState((s) => ({
    waveform: [...s.waveform.slice(-(WAVE_MAX - 1)), next],
    armed: rt.armed,
  }));
}

function attachRecognizer(kind: "send" | "live") {
  if (!speechAvailable()) return;
  const r = createRecognizer();
  if (!r) return;
  rt.recog = r;
  r.onresult = (ev) => {
    let interim = "";
    let addedFinal = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const t = res[0]?.transcript ?? "";
      if (res.isFinal) addedFinal += `${t} `;
      else interim += t;
    }
    if (addedFinal) rt.liveFinal = `${rt.liveFinal} ${addedFinal}`.replace(/\s+/g, " ").trim();
    rt.liveInterim = interim;
    if (rt.armed) {
      rt.armedUtterance = `${rt.armedUtterance} ${addedFinal} ${interim}`
        .replace(/\s+/g, " ")
        .trim();
    }
    setLive();

    const settings = useApp.getState().settings;
    if (kind === "send" && settings.sendEnabled && rt.armed) {
      const hay = rt.armedUtterance || `${addedFinal} ${interim}`;
      if (phraseHeard(hay, settings.sendPhrase, "send")) {
        diag("send phrase", "accepted");
        signal("double");
        void useVoice.getState().done();
      }
    }
  };
  r.onerror = (ev) => {
    diag("send phrase", `recognition error ${ev.error}`);
    if (ev.error === "not-allowed") {
      try {
        r.abort();
      } catch {
        /* */
      }
    }
  };
  r.onend = () => {
    if (useVoice.getState().flow === "recording" && rt.recog === r) {
      window.setTimeout(() => {
        if (useVoice.getState().flow === "recording" && rt.recog === r) {
          try {
            r.start();
          } catch {
            /* */
          }
        }
      }, 80);
    }
  };
  try {
    r.start();
  } catch (e) {
    diag("send phrase", `could not start recognizer: ${String(e)}`);
  }
}

async function getStream(): Promise<MediaStream> {
  const id = useApp.getState().settings.microphoneId;
  const constraints: MediaStreamConstraints = {
    audio: id
      ? { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    diag("microphone", `selected device failed, falling back (${String(e)})`);
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

async function finishPipeline(blob: Blob | null) {
  const settings = useApp.getState().settings;
  const live = `${rt.liveFinal} ${rt.liveInterim}`.replace(/\s+/g, " ").trim();
  const recordingId = uid();
  if (blob && blob.size > 0) {
    try {
      await saveRecording(recordingId, blob);
    } catch (e) {
      diag("audio", `failed to persist recording: ${String(e)}`);
    }
  }

  useVoice.setState({
    flow: "transcribing",
    workStatus:
      settings.transcribeEngine === "whisper" ? "Checking the Whisper model…" : "Sending audio…",
    workProgress: null,
  });
  diag("transcription", `started (${settings.transcribeEngine})`);

  let raw = settings.transcribeEngine === "browser" ? live : "";
  const engine =
    settings.transcribeEngine === "browser"
      ? "Browser speech"
      : settings.transcribeEngine === "whisper"
        ? `Whisper ${settings.whisperModel}`
        : "Grok STT";

  if (settings.transcribeEngine !== "browser" && blob && blob.size > 800) {
    let modelTimer: number | null = null;
    try {
      if (settings.transcribeEngine === "whisper") {
        const refreshModelStatus = async () => {
          try {
            const status = await whisperModelStatus({
              data: { whisperModel: settings.whisperModel },
            });
            useVoice.setState({
              workStatus:
                status.phase === "ready" ? "Transcribing your recording…" : status.message,
              workProgress: status.phase === "ready" ? null : status.progress,
            });
          } catch {
            /* The transcription request remains authoritative. */
          }
        };
        void refreshModelStatus();
        modelTimer = window.setInterval(() => void refreshModelStatus(), 1000);
      }
      const audioBase64 = await blobToBase64(blob);
      const result = await withTimeout(
        transcribeAudio({
          data: {
            audioBase64,
            mimeType: blob.type || rt.mime,
            filename: filenameForMime(blob.type || rt.mime),
            engine: settings.transcribeEngine,
            whisperModel: settings.whisperModel,
            ...sessionFields(),
          },
        }),
        TRANSCRIPTION_TIMEOUT_MS,
        "Transcription timed out. The recording was saved; try Base English or re-transcribe it.",
      );
      if (result.ok && result.text.trim()) {
        raw = result.text;
      } else {
        const message = result.ok ? "Whisper did not return a transcript." : result.error;
        diag("transcription", message);
        useVoice.setState({ flow: "error", raw: live, error: message });
        persistItem({
          raw: live,
          cleaned: null,
          status: "error",
          engine,
          recordingId: blob ? recordingId : null,
          cleanupFailure: message,
        });
        await deleteDraft();
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transcription failed.";
      diag("transcription", msg);
      useVoice.setState({ flow: "error", raw: live, error: msg });
      persistItem({
        raw: live,
        cleaned: null,
        status: "error",
        engine,
        recordingId: blob ? recordingId : null,
        cleanupFailure: msg,
      });
      await deleteDraft();
      return;
    } finally {
      if (modelTimer !== null) window.clearInterval(modelTimer);
    }
  } else if (settings.transcribeEngine !== "browser") {
    const message =
      "The saved recording is incomplete. Nothing was marked complete; please try again.";
    useVoice.setState({ flow: "error", raw: live, error: message });
    persistItem({
      raw: live,
      cleaned: null,
      status: "error",
      engine,
      recordingId: blob ? recordingId : null,
      cleanupFailure: message,
    });
    await deleteDraft();
    return;
  }

  if (!raw.trim()) {
    signal("one");
    useVoice.setState({
      flow: "no-speech",
      raw: "",
      finalText: "",
      error: "No speech was found in this recording.",
    });
    persistItem({
      raw: "",
      cleaned: null,
      status: "no-speech",
      engine,
      recordingId: blob ? recordingId : null,
    });
    await deleteDraft();
    diag("pipeline", "no speech");
    return;
  }

  const prompt = useApp.getState().defaultPrompt();
  let cleaned: string | null = null;
  let status: HistoryItem["status"] = "complete";
  let failure: string | undefined;
  let exchange: CleanupExchange | null = null;

  useVoice.setState({
    flow: "cleaning",
    raw,
    workStatus: "Cleaning the transcript…",
    workProgress: null,
  });
  signal("one");
  diag("AI cleanup", `via ${settings.provider} ${settings.model} · ${prompt.name}`);
  const result = await runCleanup(raw, prompt);
  if (result.ok) {
    cleaned = result.text;
    exchange = result.exchange;
    signal("double");
  } else {
    failure = result.error;
    exchange = result.exchange;
    status = "cleanup-failed";
  }

  const finalText = (cleaned ?? raw).trim();
  const itemId = persistItem({
    raw,
    cleaned,
    status,
    engine,
    recordingId: blob ? recordingId : null,
    cleanupFailure: failure,
    exchange,
    promptName: prompt.name,
    promptId: prompt.id,
  });

  await deleteDraft();
  rt.chunks = [];
  rt.prefix = [];
  rt.sessionId = "";

  useVoice.setState({
    flow: status === "cleanup-failed" ? "cleanup-failed" : "complete",
    raw,
    finalText,
    error: failure ?? "",
    itemId,
    exchange,
    recovered: null,
  });

  if (settings.autoInsert) {
    await useVoice.getState().insert();
  } else if (settings.insertEnabled) {
    startInsertListener();
  }
}

function persistItem(partial: {
  raw: string;
  cleaned: string | null;
  status: HistoryItem["status"];
  engine: string;
  recordingId: string | null;
  cleanupFailure?: string;
  exchange?: CleanupExchange | null;
  promptName?: string | null;
  promptId?: string | null;
  source?: HistoryItem["source"];
}): string {
  const id = uid();
  const item: HistoryItem = {
    id,
    createdAt: new Date().toISOString(),
    raw: partial.raw,
    cleaned: partial.cleaned,
    promptName: partial.promptName ?? null,
    promptId: partial.promptId ?? null,
    recordingId: partial.recordingId,
    folderId:
      useApp.getState().scope === "all" ||
      useApp.getState().scope === "unfiled" ||
      useApp.getState().scope === "custom"
        ? null
        : useApp.getState().scope,
    archived: false,
    status: partial.status,
    source: partial.source ?? "recording",
    cleanupFailure: partial.cleanupFailure,
    engine: partial.engine,
    previousRaw: [],
    exchange: partial.exchange ?? null,
  };
  useApp.getState().addHistory(item);
  useVoice.setState({ itemId: id });
  return id;
}

let insertRecog: Recog = null;

function stopInsertListener() {
  try {
    insertRecog?.abort();
  } catch {
    /* */
  }
  insertRecog = null;
}

function startInsertListener() {
  stopInsertListener();
  const settings = useApp.getState().settings;
  if (!settings.insertEnabled || settings.autoInsert) return;
  if (!speechAvailable()) return;
  const r = createRecognizer();
  if (!r) return;
  insertRecog = r;
  r.onresult = (ev) => {
    let text = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      text += ev.results[i][0]?.transcript ?? "";
    }
    if (phraseHeard(text, settings.insertPhrase, "insert")) {
      diag("insert phrase", "accepted");
      stopInsertListener();
      void useVoice.getState().insert();
    }
  };
  r.onend = () => {
    const flow = useVoice.getState().flow;
    if ((flow === "complete" || flow === "cleanup-failed") && insertRecog === r) {
      try {
        r.start();
      } catch {
        /* */
      }
    }
  };
  try {
    r.start();
  } catch {
    /* */
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

async function collectBlob(): Promise<Blob | null> {
  const recorder = rt.recorder;
  if (recorder && recorder.state !== "inactive") {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(
          new Error("The recorder did not finish saving the audio. Your recovery draft was kept."),
        );
      }, 10_000);
      recorder.addEventListener(
        "stop",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      recorder.addEventListener(
        "error",
        () => {
          window.clearTimeout(timer);
          reject(
            new Error(
              "The recorder could not finish saving the audio. Your recovery draft was kept.",
            ),
          );
        },
        { once: true },
      );
      try {
        if (recorder.state === "paused") recorder.resume();
        recorder.requestData?.();
        recorder.stop();
      } catch (error) {
        window.clearTimeout(timer);
        reject(error);
      }
    });
  }
  const chunks = allChunks();
  if (!chunks.length) return null;
  return new Blob(chunks, { type: rt.mime || chunks[0]?.type || "audio/webm" });
}

export const useVoice = create<VoiceState>((set, get) => ({
  flow: "idle",
  trigger: "manual",
  elapsedMs: 0,
  waveform: [],
  live: "",
  raw: "",
  finalText: "",
  error: "",
  workStatus: "",
  workProgress: null,
  armed: false,
  itemId: null,
  wakeStatus: "off",
  exchange: null,
  recovered: null,

  start: async (trigger, hold = false) => {
    const flow = get().flow;
    if (flow === "paused") {
      get().resume();
      return;
    }
    if (
      flow !== "idle" &&
      flow !== "complete" &&
      flow !== "cleanup-failed" &&
      flow !== "no-speech" &&
      flow !== "error"
    ) {
      return;
    }
    if (flow !== "idle") get().dismiss();
    unlockAudio();
    pauseWake();
    rt.holdMode = hold;
    rt.hasSpoken = false;
    rt.silenceMs = 0;
    rt.speechHoldMs = 0;
    rt.beepSpent = false;
    rt.armed = false;
    rt.armedUtterance = "";
    if (!rt.prefix.length) {
      rt.liveFinal = "";
      rt.liveInterim = "";
      rt.elapsedOffset = 0;
    }
    rt.chunks = [];
    rt.buffersSeen = 0;
    if (!rt.sessionId) rt.sessionId = uid();
    set({
      flow: "preparing",
      trigger,
      elapsedMs: rt.elapsedOffset,
      waveform: rt.prefix.length ? get().waveform : [],
      live: rt.liveFinal,
      raw: "",
      finalText: "",
      error: "",
      workStatus: "",
      workProgress: null,
      armed: false,
      itemId: null,
      exchange: null,
    });
    diag("pipeline", `start via ${trigger}`);

    if (!navigator.mediaDevices?.getUserMedia) {
      set({ flow: "error", error: "This browser cannot access the microphone." });
      resumeWakeSoon();
      return;
    }

    let attempt = 0;
    let stream: MediaStream | null = null;
    let lastErr = "Could not open the microphone.";
    while (attempt < 4 && !stream) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
        stream = await getStream();
      } catch (e) {
        lastErr = e instanceof Error ? e.message : lastErr;
        attempt += 1;
      }
    }
    if (!stream) {
      set({
        flow: "error",
        error: /denied|NotAllowed/i.test(lastErr)
          ? "Microphone permission is required to record."
          : "No microphone input is available.",
      });
      resumeWakeSoon();
      return;
    }

    const label = stream.getAudioTracks()[0]?.label ?? "";
    if (/bluetooth|airpods|hands-free/i.test(label)) {
      await new Promise((r) => setTimeout(r, 800));
    }

    rt.stream = stream;
    signal("one");

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      rt.ctx = new AC();
      rt.source = rt.ctx.createMediaStreamSource(stream);
      rt.analyser = rt.ctx.createAnalyser();
      rt.analyser.fftSize = 2048;
      rt.source.connect(rt.analyser);

      rt.mime = pickRecorderMime();
      try {
        rt.recorder = rt.mime
          ? new MediaRecorder(stream, { mimeType: rt.mime })
          : new MediaRecorder(stream);
      } catch {
        rt.recorder = new MediaRecorder(stream);
      }
      rt.recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) rt.chunks.push(ev.data);
      };
      rt.recorder.start(250);
      startClock();
      startDraftLoop();
      void persistDraftNow();

      rt.healthTimer = window.setTimeout(() => {
        if (rt.buffersSeen === 0 && rt.analyser && rt.stream) {
          diag("audio", "no buffers after 1.25s, rebuilding analyser");
          try {
            rt.source?.disconnect();
            rt.source = rt.ctx!.createMediaStreamSource(rt.stream);
            rt.analyser = rt.ctx!.createAnalyser();
            rt.analyser.fftSize = 2048;
            rt.source.connect(rt.analyser);
          } catch (e) {
            diag("audio", `rebuild failed ${String(e)}`);
          }
        }
      }, 1250) as unknown as number;

      attachRecognizer("send");
      set({ flow: "recording" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start recording.";
      teardownCapture();
      set({
        flow: "error",
        error: /denied|NotAllowed/i.test(msg)
          ? "Microphone permission is required to record."
          : msg,
      });
      resumeWakeSoon();
    }
  },

  pointerUp: () => {
    if (!rt.holdMode) return;
    if (get().flow === "recording") void get().done();
  },

  pause: () => {
    if (get().flow !== "recording") return;
    rt.elapsedOffset = currentElapsed();
    stopClock();
    try {
      rt.recog?.stop();
    } catch {
      /* */
    }
    rt.recog = null;
    try {
      if (rt.recorder && rt.recorder.state === "recording") rt.recorder.pause();
    } catch {
      /* */
    }
    void persistDraftNow();
    set({ flow: "paused", elapsedMs: rt.elapsedOffset });
    diag("pipeline", "paused");
  },

  resume: () => {
    if (get().flow !== "paused") return;
    try {
      if (rt.recorder && rt.recorder.state === "paused") rt.recorder.resume();
    } catch {
      /* */
    }
    attachRecognizer("send");
    startClock();
    startDraftLoop();
    set({ flow: "recording" });
    diag("pipeline", "resumed");
  },

  done: async () => {
    const flow = get().flow;
    if (flow !== "recording" && flow !== "preparing" && flow !== "paused") return;
    rt.holdMode = false;
    signal("one");
    try {
      rt.elapsedOffset = currentElapsed();
      stopClock();
      stopDraftLoop();
      set({ flow: "transcribing", elapsedMs: rt.elapsedOffset });
      const blob = await collectBlob();
      await persistDraftNow();
      teardownCapture({ keepDraft: true });
      await finishPipeline(blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not finish recording.";
      teardownCapture({ keepDraft: true });
      set({ flow: "error", error: msg });
      diag("pipeline", msg);
    }
  },

  cancel: () => {
    teardownCapture();
    stopInsertListener();
    void deleteDraft();
    set({
      flow: "idle",
      waveform: [],
      live: "",
      raw: "",
      finalText: "",
      error: "",
      workStatus: "",
      workProgress: null,
      elapsedMs: 0,
      armed: false,
      itemId: null,
      recovered: null,
    });
    diag("pipeline", "cancelled");
    resumeWakeSoon();
  },

  dismiss: () => {
    stopInsertListener();
    set({
      flow: "idle",
      waveform: [],
      live: "",
      raw: "",
      finalText: "",
      error: "",
      workStatus: "",
      workProgress: null,
      elapsedMs: 0,
      armed: false,
      itemId: null,
      exchange: null,
    });
    resumeWakeSoon();
  },

  setFinalText: (v) => set({ finalText: v }),

  copy: async () => {
    const text = get().finalText.trim() || get().raw.trim();
    if (!text) return;
    const keepOpen = useApp.getState().settings.keepOverlayOpen;
    const native = postNativeWidget({ action: "copy", text, close: !keepOpen });
    const ok = native || (await copyText(text));
    if (ok) {
      signal("one");
      toast.success("Copied");
      if (!useApp.getState().settings.keepOverlayOpen) get().dismiss();
    } else {
      toast.error("Could not copy");
    }
  },

  insert: async () => {
    const text = get().finalText.trim() || get().raw.trim();
    if (!text) return;
    useApp.getState().appendPad(text);
    const keepOpen = useApp.getState().settings.keepOverlayOpen;
    const native = postNativeWidget({ action: "insert", text, close: !keepOpen });
    const ok = native || (await copyText(text));
    signal("one");
    toast.success(ok ? "Inserted into pad and copied" : "Inserted into pad");
    stopInsertListener();
    if (!useApp.getState().settings.keepOverlayOpen) get().dismiss();
  },

  share: async () => {
    const text = get().finalText.trim() || get().raw.trim();
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        signal("one");
        return;
      } catch {
        /* cancelled */
      }
    }
    await get().copy();
  },

  retryCleanup: async () => {
    const raw = get().raw.trim();
    if (!raw) return;
    const prompt = useApp.getState().defaultPrompt();
    set({ flow: "cleaning" });
    const result = await runCleanup(raw, prompt);
    if (result.ok) {
      signal("double");
      set({ flow: "complete", finalText: result.text, error: "", exchange: result.exchange });
      const id = get().itemId;
      if (id) {
        useApp.getState().updateHistory(id, {
          cleaned: result.text,
          status: "complete",
          cleanupFailure: undefined,
          exchange: result.exchange,
          promptName: prompt.name,
          promptId: prompt.id,
        });
      }
    } else {
      set({
        flow: "cleanup-failed",
        error: result.error,
        exchange: result.exchange ?? null,
      });
      const id = get().itemId;
      if (id) {
        useApp.getState().updateHistory(id, {
          status: "cleanup-failed",
          cleanupFailure: result.error,
          exchange: result.exchange ?? null,
        });
      }
    }
  },

  reclean: async (id, promptId) => {
    const item = useApp.getState().history.find((h) => h.id === id);
    if (!item?.raw.trim()) {
      toast.error("No raw transcript to clean");
      return;
    }
    const prompt = useApp.getState().promptById(promptId ?? useApp.getState().defaultPromptId);
    toast.message(`Cleaning with ${prompt.name}…`);
    const result = await runCleanup(item.raw, prompt);
    if (result.ok) {
      signal("double");
      useApp.getState().updateHistory(id, {
        cleaned: result.text,
        status: "complete",
        cleanupFailure: undefined,
        exchange: result.exchange,
        promptName: prompt.name,
        promptId: prompt.id,
      });
      toast.success(`Cleaned with ${prompt.name}`);
    } else {
      useApp.getState().updateHistory(id, {
        status: "cleanup-failed",
        cleanupFailure: result.error,
        exchange: result.exchange ?? null,
      });
      toast.error(result.error);
    }
  },

  retranscribe: async (id) => {
    const item = useApp.getState().history.find((h) => h.id === id);
    if (!item?.recordingId) {
      toast.error("Original recording is missing");
      return;
    }
    const blob = await (await import("@/lib/idb")).loadRecording(item.recordingId);
    if (!blob) {
      toast.error("Original recording is missing");
      return;
    }
    toast.message("Re-transcribing…");
    const settings = useApp.getState().settings;
    let text = "";
    let engine = item.engine;
    try {
      const audioBase64 = await blobToBase64(blob);
      const result = await withTimeout(
        transcribeAudio({
          data: {
            audioBase64,
            mimeType: blob.type,
            filename: filenameForMime(blob.type),
            engine: settings.transcribeEngine === "browser" ? "grok" : settings.transcribeEngine,
            whisperModel: settings.whisperModel,
            ...sessionFields(),
          },
        }),
        TRANSCRIPTION_TIMEOUT_MS,
        "Re-transcription timed out. Try the Base English model.",
      );
      if (!result.ok || !result.text.trim()) {
        toast.error(result.ok ? "No speech detected" : result.error);
        return;
      }
      text = result.text;
      engine =
        settings.transcribeEngine === "whisper" ? `Whisper ${settings.whisperModel}` : "Grok STT";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-transcribe failed");
      return;
    }
    if (!text.trim()) {
      toast.error("No speech detected");
      return;
    }
    const previousRaw = item.raw.trim() ? [...item.previousRaw, item.raw] : item.previousRaw;
    useApp.getState().updateHistory(id, { raw: text, engine, previousRaw });
    signal("one");
    await get().reclean(id);
  },

  syncWake: () => {
    const settings = useApp.getState().settings;
    const busy = get().flow !== "idle";
    if (!settings.keepMicIdle || !settings.wakeEnabled || !settings.wakePhrase.trim() || busy) {
      pauseWake();
      if (!settings.keepMicIdle || !settings.wakeEnabled) set({ wakeStatus: "off" });
      else if (busy) set({ wakeStatus: "paused" });
      return;
    }
    startWake();
  },

  loadRecovered: async () => {
    const draft = await loadDraft();
    if (!draft) {
      set({ recovered: null });
      return;
    }
    const blob = blobFromDraft(draft);
    const size = blob?.size ?? 0;
    if (size < 200 && !draft.live.trim()) {
      await deleteDraft();
      set({ recovered: null });
      return;
    }
    set({
      recovered: {
        id: draft.id,
        createdAt: draft.createdAt,
        elapsedMs: draft.elapsedMs,
        live: draft.live,
        size,
      },
    });
  },

  finishRecovered: async () => {
    const draft = await loadDraft();
    if (!draft) {
      set({ recovered: null });
      return;
    }
    pauseWake();
    rt.sessionId = draft.id;
    rt.liveFinal = draft.live;
    rt.liveInterim = "";
    rt.mime = draft.mime;
    rt.prefix = draft.chunks;
    rt.chunks = [];
    set({
      flow: "transcribing",
      trigger: "recover",
      live: draft.live,
      elapsedMs: draft.elapsedMs,
      recovered: null,
    });
    const blob = blobFromDraft(draft);
    await finishPipeline(blob);
  },

  continueRecovered: async () => {
    const draft = await loadDraft();
    if (!draft) {
      set({ recovered: null });
      return;
    }
    rt.sessionId = draft.id;
    rt.prefix = draft.chunks;
    rt.liveFinal = draft.live;
    rt.liveInterim = "";
    rt.elapsedOffset = draft.elapsedMs;
    rt.mime = draft.mime;
    set({ recovered: null, elapsedMs: draft.elapsedMs, live: draft.live });
    await get().start("recover", false);
  },

  discardRecovered: async () => {
    await deleteDraft();
    rt.prefix = [];
    rt.sessionId = "";
    set({ recovered: null });
  },
}));

function pauseWake() {
  try {
    rt.wake?.abort();
  } catch {
    /* */
  }
  rt.wake = null;
}

function resumeWakeSoon() {
  window.setTimeout(() => useVoice.getState().syncWake(), 400);
}

function startWake() {
  if (rt.wake) return;
  if (!speechAvailable()) {
    useVoice.setState({ wakeStatus: "unavailable" });
    return;
  }
  const r = createRecognizer();
  if (!r) {
    useVoice.setState({ wakeStatus: "unavailable" });
    return;
  }
  rt.wake = r;
  let rolling = "";
  r.onresult = (ev) => {
    let chunk = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      chunk += `${ev.results[i][0]?.transcript ?? ""} `;
    }
    rolling = `${rolling} ${chunk}`.replace(/\s+/g, " ").trim().split(" ").slice(-8).join(" ");
    const phrase = useApp.getState().settings.wakePhrase;
    if (phraseHeard(rolling, phrase, "wake") || phraseHeard(chunk, phrase, "wake")) {
      diag("wake phrase", `matched “${rolling}”`);
      rolling = "";
      pauseWake();
      void useVoice.getState().start("wake");
    }
  };
  r.onerror = (ev) => {
    if (ev.error === "not-allowed") {
      useVoice.setState({ wakeStatus: "missing-permission" });
      pauseWake();
      return;
    }
    if (ev.error === "no-speech" || ev.error === "aborted") return;
    diag("wake phrase", ev.error);
    pauseWake();
    window.setTimeout(() => useVoice.getState().syncWake(), 900);
  };
  r.onend = () => {
    if (
      rt.wake === r &&
      useVoice.getState().flow === "idle" &&
      useApp.getState().settings.wakeEnabled
    ) {
      window.setTimeout(() => {
        if (rt.wake === r && useVoice.getState().flow === "idle") {
          try {
            r.start();
          } catch {
            pauseWake();
            useVoice.getState().syncWake();
          }
        }
      }, 60);
    }
  };
  try {
    r.start();
    useVoice.setState({ wakeStatus: "listening" });
    diag("wake phrase", "listening");
  } catch {
    useVoice.setState({ wakeStatus: "error" });
    rt.wake = null;
  }
}

export function isBusy(flow: FlowState) {
  return flow !== "idle";
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void persistDraftNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistDraftNow();
  });
}
