import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { WHISPER_MODELS, type WhisperModelId } from "@/lib/types";

export type WhisperServerPhase = "idle" | "downloading" | "loading" | "ready" | "error";
export type WhisperServerStatus = {
  modelId: WhisperModelId;
  phase: WhisperServerPhase;
  progress: number;
  message: string;
  cached: boolean;
  error: string;
};

type WorkerMessage =
  | { type: "progress"; status?: string; progress?: number; file?: string }
  | { type: "ready" }
  | { type: "result"; requestId?: string; text?: string }
  | { type: "request-error"; requestId?: string; error?: string }
  | { type: "error"; error?: string };

type ResidentRequest = {
  work: string;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
};

type ResidentWorker = {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  nextRequestId: number;
  pending: Map<string, ResidentRequest>;
};

const globals = globalThis as typeof globalThis & {
  __talkaiWhisperStates?: Map<WhisperModelId, WhisperServerStatus>;
  __talkaiWhisperPrepare?: Map<WhisperModelId, Promise<void>>;
  __talkaiWhisperChains?: Map<WhisperModelId, Promise<unknown>>;
  __talkaiWhisperWorkers?: Map<WhisperModelId, ResidentWorker>;
};
globals.__talkaiWhisperStates ??= new Map();
globals.__talkaiWhisperPrepare ??= new Map();
globals.__talkaiWhisperChains ??= new Map();
globals.__talkaiWhisperWorkers ??= new Map();

function cacheDir() {
  return process.env.TALKAI_WHISPER_CACHE_DIR?.trim() || join(process.cwd(), "data", "whisper");
}

function nativeWhisperKit(id: WhisperModelId) {
  if (id !== "large-v3-turbo") return undefined;
  const cli =
    process.env.TALKAI_WHISPERKIT_CLI?.trim() ||
    join(homedir(), "Library", "Application Support", "Talk AI", "bin", "whisperkit-cli");
  const model =
    process.env.TALKAI_WHISPERKIT_MODEL_DIR?.trim() ||
    join(
      homedir(),
      "Documents",
      "huggingface",
      "models",
      "argmaxinc",
      "whisperkit-coreml",
      "openai_whisper-large-v3_turbo",
    );
  return { cli, model };
}

function localNativeOnly() {
  return process.env.TALKAI_LOCAL_MODE === "1";
}

async function nativeWhisperKitReady(id: WhisperModelId) {
  const native = nativeWhisperKit(id);
  if (!native) return false;
  try {
    await Promise.all([
      access(native.cli, constants.X_OK),
      access(join(native.model, "AudioEncoder.mlmodelc")),
      access(join(native.model, "TextDecoder.mlmodelc")),
      access(join(native.model, "MelSpectrogram.mlmodelc")),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function requireConfiguredLocalModel(id: WhisperModelId) {
  if (!localNativeOnly()) return;
  if (id !== "large-v3-turbo") {
    throw new Error("This server is configured to use only Whisper Large v3 Turbo via Core ML.");
  }
  if (!(await nativeWhisperKitReady(id))) {
    throw new Error(
      "The configured WhisperKit CLI or Core ML model directory could not be opened. No fallback model will be downloaded.",
    );
  }
}

function readyMarker(id: WhisperModelId) {
  return join(cacheDir(), ".ready", `${id}.json`);
}

async function isMarkedReady(id: WhisperModelId) {
  try {
    await access(readyMarker(id));
    return true;
  } catch {
    return false;
  }
}

async function markReady(id: WhisperModelId) {
  const directory = join(cacheDir(), ".ready");
  await mkdir(directory, { recursive: true });
  await writeFile(
    readyMarker(id),
    `${JSON.stringify({ version: 2, modelId: id, readyAt: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}

async function ensureResidentWorker(id: WhisperModelId): Promise<ResidentWorker> {
  const current = globals.__talkaiWhisperWorkers?.get(id);
  if (current && current.child.exitCode === null && !current.child.killed) {
    await current.ready;
    return current;
  }

  const meta = WHISPER_MODELS.find((model) => model.id === id);
  if (!meta) throw new Error("Unknown Whisper model.");
  const cached = await isMarkedReady(id);
  setStatus({
    modelId: id,
    phase: cached ? "loading" : "downloading",
    progress: cached ? 10 : 0,
    message: cached
      ? "Loading Whisper once for this server session…"
      : `Downloading ${meta.label}…`,
    cached,
    error: "",
  });
  await mkdir(cacheDir(), { recursive: true });

  const child = spawn(
    process.execPath,
    [
      join(process.cwd(), "scripts", "whisper-worker.mjs"),
      "--model",
      id,
      "--repo",
      meta.hf,
      "--cache",
      cacheDir(),
      "--persistent",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  let readySettled = false;
  let stderr = "";
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const worker: ResidentWorker = { child, ready, nextRequestId: 0, pending: new Map() };
  globals.__talkaiWhisperWorkers?.set(id, worker);

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message: WorkerMessage;
    try {
      message = JSON.parse(line) as WorkerMessage;
    } catch {
      return;
    }
    if (message.type === "progress") {
      const downloading = ["progress", "download", "initiate"].includes(message.status ?? "");
      setStatus({
        modelId: id,
        phase: downloading && !cached ? "downloading" : "loading",
        progress: message.progress ?? 1,
        message:
          downloading && !cached
            ? `Downloading ${message.file || "model files"}…`
            : "Loading Whisper once for this server session…",
        cached,
        error: "",
      });
    } else if (message.type === "ready") {
      readySettled = true;
      void markReady(id);
      setStatus({
        modelId: id,
        phase: "ready",
        progress: 100,
        message: "Whisper is loaded and ready for recordings",
        cached: true,
        error: "",
      });
      readyResolve();
    } else if (message.type === "result" && message.requestId) {
      const pending = worker.pending.get(message.requestId);
      if (!pending) return;
      worker.pending.delete(message.requestId);
      void rm(pending.work, { recursive: true, force: true });
      pending.resolve(message.text ?? "");
    } else if (message.type === "request-error" && message.requestId) {
      const pending = worker.pending.get(message.requestId);
      if (!pending) return;
      worker.pending.delete(message.requestId);
      void rm(pending.work, { recursive: true, force: true });
      pending.reject(new Error(message.error || "Whisper failed."));
    } else if (message.type === "error") {
      stderr = message.error || "Whisper failed.";
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
  });
  const fail = (error: Error) => {
    if (globals.__talkaiWhisperWorkers?.get(id) === worker) {
      globals.__talkaiWhisperWorkers.delete(id);
    }
    if (!readySettled) {
      readySettled = true;
      readyReject(error);
    }
    for (const pending of worker.pending.values()) {
      void rm(pending.work, { recursive: true, force: true });
      pending.reject(error);
    }
    worker.pending.clear();
    setStatus({
      modelId: id,
      phase: "error",
      progress: 0,
      message: "",
      cached,
      error: error.message,
    });
  };
  child.on("error", fail);
  child.on("close", (code) => {
    fail(new Error(stderr.trim() || `Whisper resident worker exited with status ${code}.`));
  });

  await ready;
  return worker;
}

async function transcribeWithResidentWorker(audio: Buffer, id: WhisperModelId): Promise<string> {
  const worker = await ensureResidentWorker(id);
  const work = await mkdtemp(join(tmpdir(), "talkai-whisper-"));
  const audioPath = join(work, "recording.webm");
  await writeFile(audioPath, audio, { mode: 0o600 });
  const requestId = `${process.pid}-${++worker.nextRequestId}`;
  return new Promise<string>((resolve, reject) => {
    worker.pending.set(requestId, { work, resolve, reject });
    worker.child.stdin.write(
      `${JSON.stringify({ type: "transcribe", requestId, audioPath })}\n`,
      (error) => {
        if (!error) return;
        worker.pending.delete(requestId);
        void rm(work, { recursive: true, force: true });
        reject(error);
      },
    );
  });
}

function setStatus(status: WhisperServerStatus) {
  globals.__talkaiWhisperStates?.set(status.modelId, status);
  return status;
}

export async function getWhisperModelStatus(id: WhisperModelId): Promise<WhisperServerStatus> {
  if (!WHISPER_MODELS.some((model) => model.id === id)) throw new Error("Unknown Whisper model.");
  await requireConfiguredLocalModel(id);
  const current = globals.__talkaiWhisperStates?.get(id);
  if (current) return current;
  const nativeReady = await nativeWhisperKitReady(id);
  const cached = nativeReady || (await isMarkedReady(id));
  return {
    modelId: id,
    phase: cached ? "ready" : "idle",
    progress: cached ? 100 : 0,
    message: nativeReady
      ? "Existing Core ML model ready · loads only while transcribing"
      : cached
        ? "Downloaded on this Mac"
        : "Not downloaded yet",
    cached,
    error: "",
  };
}

function enqueue<T>(id: WhisperModelId, action: () => Promise<T>): Promise<T> {
  const previous = globals.__talkaiWhisperChains?.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  globals.__talkaiWhisperChains?.set(id, next);
  const cleanup = () => {
    if (globals.__talkaiWhisperChains?.get(id) === next) globals.__talkaiWhisperChains.delete(id);
  };
  void next.then(cleanup, cleanup);
  return next;
}

async function runWorker(id: WhisperModelId, audio?: Buffer): Promise<string> {
  await requireConfiguredLocalModel(id);
  const meta = WHISPER_MODELS.find((model) => model.id === id);
  if (!meta) throw new Error("Unknown Whisper model.");
  const native = nativeWhisperKit(id);
  const nativeReady = await nativeWhisperKitReady(id);
  const cached = nativeReady || (await isMarkedReady(id));
  setStatus({
    modelId: id,
    phase: cached ? "loading" : "downloading",
    progress: cached ? 10 : 0,
    message: nativeReady
      ? audio
        ? "Preparing the existing Core ML model…"
        : "Checking the existing Core ML model…"
      : cached
        ? "Loading Whisper for this recording…"
        : `Downloading ${meta.label}…`,
    cached,
    error: "",
  });

  await mkdir(cacheDir(), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "talkai-whisper-"));
  const audioPath = audio ? join(work, "recording.webm") : undefined;
  if (audioPath && audio) await writeFile(audioPath, audio, { mode: 0o600 });

  return new Promise<string>((resolve, reject) => {
    const args = [
      join(process.cwd(), "scripts", "whisper-worker.mjs"),
      "--model",
      id,
      "--repo",
      meta.hf,
      "--cache",
      cacheDir(),
    ];
    if (nativeReady && native) {
      args.push("--native-cli", native.cli, "--native-model", native.model);
    }
    if (audioPath) args.push("--audio", audioPath);
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let result: string | undefined;
    let reportedError = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(
      () => {
        child.kill("SIGKILL");
        reportedError = audio
          ? "Whisper transcription timed out after 10 minutes."
          : "Whisper model preparation timed out after 30 minutes.";
      },
      audio ? 600_000 : 1_800_000,
    );

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message: WorkerMessage;
      try {
        message = JSON.parse(line) as WorkerMessage;
      } catch {
        return;
      }
      if (message.type === "progress") {
        const downloading = ["progress", "download", "initiate"].includes(message.status ?? "");
        setStatus({
          modelId: id,
          phase: downloading && !cached ? "downloading" : "loading",
          progress: message.progress ?? 1,
          message:
            downloading && !cached
              ? `Downloading ${message.file || "model files"}…`
              : audio
                ? "Loading Whisper for this recording…"
                : "Checking the downloaded model…",
          cached,
          error: "",
        });
      } else if (message.type === "ready") {
        void markReady(id);
        setStatus({
          modelId: id,
          phase: "ready",
          progress: 100,
          message: audio
            ? nativeReady
              ? "Transcribing every recording segment with Core ML…"
              : "Transcribing in the isolated Whisper process…"
            : nativeReady
              ? "Existing Core ML model ready · loads only while transcribing"
              : "Downloaded on this Mac · loads only while transcribing",
          cached: true,
          error: "",
        });
      } else if (message.type === "result") {
        result = message.text ?? "";
      } else if (message.type === "error") {
        reportedError = message.error || "Whisper failed.";
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void rm(work, { recursive: true, force: true });
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void rm(work, { recursive: true, force: true });
      if (code === 0 && (!audio || result !== undefined)) {
        // The worker exits here, which releases all model RAM while the disk
        // cache and ready marker remain available for the next recording.
        setStatus({
          modelId: id,
          phase: "ready",
          progress: 100,
          message: nativeReady
            ? "Existing Core ML model ready · transcription memory released"
            : "Downloaded on this Mac · memory released",
          cached: true,
          error: "",
        });
        resolve(result ?? "");
        return;
      }
      const error = reportedError || stderr.trim() || `Whisper exited with status ${code}.`;
      setStatus({
        modelId: id,
        phase: "error",
        progress: 0,
        message: "",
        cached,
        error,
      });
      reject(new Error(error));
    });
  });
}

export function warmWhisperModel(id: WhisperModelId): Promise<void> {
  const current = globals.__talkaiWhisperPrepare?.get(id);
  if (current) return current;
  const job = enqueue(id, async () => {
    await requireConfiguredLocalModel(id);
    if (await nativeWhisperKitReady(id)) {
      await runWorker(id);
      return;
    }
    await ensureResidentWorker(id);
  });
  globals.__talkaiWhisperPrepare?.set(id, job);
  const cleanup = () => {
    if (globals.__talkaiWhisperPrepare?.get(id) === job) globals.__talkaiWhisperPrepare.delete(id);
  };
  void job.then(cleanup, cleanup);
  return job;
}

export function startWhisperModel(id: WhisperModelId) {
  void warmWhisperModel(id);
}

export async function transcribeWithWhisper(
  audio: Buffer,
  modelId: WhisperModelId,
): Promise<string> {
  const preparing = globals.__talkaiWhisperPrepare?.get(modelId);
  if (preparing) await preparing;
  await requireConfiguredLocalModel(modelId);
  if (await nativeWhisperKitReady(modelId)) {
    return enqueue(modelId, () => runWorker(modelId, audio));
  }
  return enqueue(modelId, () => transcribeWithResidentWorker(audio, modelId));
}
