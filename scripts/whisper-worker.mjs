#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { resolveFfmpegPath } from "./ffmpeg-path.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function decodeToMono16k(ffmpegPath, path) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        path,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (chunk) => chunks.push(chunk));
    ff.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "Could not decode audio for Whisper."));
        return;
      }
      const data = Buffer.concat(chunks);
      resolve(new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4)));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-16_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${command} exited with status ${code}.`));
    });
  });
}

async function transcribeWithWhisperKit(audioPath, cliPath, modelPath, ffmpegPath) {
  const chunkDir = join(dirname(audioPath), "coreml-chunks");
  await mkdir(chunkDir, { recursive: true });
  await run(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-f",
    "segment",
    "-segment_time",
    "25",
    "-reset_timestamps",
    "1",
    "-c:a",
    "pcm_s16le",
    join(chunkDir, "chunk-%04d.wav"),
  ]);
  const chunks = (await readdir(chunkDir))
    .filter((name) => name.endsWith(".wav"))
    .sort()
    .map((name) => join(chunkDir, name));
  if (!chunks.length) return "";

  emit({ type: "ready" });
  const args = ["transcribe"];
  for (const chunk of chunks) args.push("--audio-path", chunk);
  args.push(
    "--model-path",
    modelPath,
    "--language",
    "en",
    "--task",
    "transcribe",
    "--without-timestamps",
    "--use-prefill-cache",
    "--chunking-strategy",
    "none",
    "--concurrent-worker-count",
    "1",
  );
  const { stdout } = await run(cliPath, args);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function transcribeWithPipeline(pipe, modelId, audioPath) {
  await access(audioPath);
  const pcm = await decodeToMono16k(await resolveFfmpegPath(), audioPath);
  if (pcm.length < 1600) return "";
  const options = {
    return_timestamps: false,
    chunk_length_s: 30,
    stride_length_s: 5,
  };
  if (!modelId.endsWith(".en")) {
    options.language = "english";
    options.task = "transcribe";
  }
  const result = await pipe(pcm, options);
  return (result.text ?? "").trim();
}

async function main() {
  const modelId = arg("--model");
  const modelRepo = arg("--repo");
  const cacheDir = arg("--cache");
  const audioPath = arg("--audio");
  const nativeCli = arg("--native-cli");
  const nativeModel = arg("--native-model");
  const persistent = process.argv.includes("--persistent");
  if (!modelId || !modelRepo || !cacheDir) throw new Error("Missing Whisper worker arguments.");

  // Ensure the audio file is readable before allocating the model.
  if (audioPath) await access(audioPath);
  const ffmpegPath = audioPath ? await resolveFfmpegPath() : undefined;

  if (nativeCli && nativeModel) {
    await access(nativeCli);
    await Promise.all([
      access(join(nativeModel, "AudioEncoder.mlmodelc")),
      access(join(nativeModel, "TextDecoder.mlmodelc")),
      access(join(nativeModel, "MelSpectrogram.mlmodelc")),
    ]);
    if (!audioPath) {
      emit({ type: "ready" });
      return;
    }
    const text = await transcribeWithWhisperKit(audioPath, nativeCli, nativeModel, ffmpegPath);
    emit({ type: "result", text });
    return;
  }

  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.cacheDir = cacheDir;

  const progress_callback = (update) => {
    const fraction =
      typeof update.progress === "number"
        ? update.progress / 100
        : update.total
          ? (update.loaded ?? 0) / update.total
          : 0;
    emit({
      type: "progress",
      status: update.status,
      progress: Math.max(1, Math.min(98, Math.round(fraction * 100))),
      file: update.file,
    });
  };

  let pipe;
  try {
    pipe = await pipeline("automatic-speech-recognition", modelRepo, {
      dtype: "q8",
      progress_callback,
    });
  } catch {
    pipe = await pipeline("automatic-speech-recognition", modelRepo, { progress_callback });
  }
  emit({ type: "ready" });

  if (persistent) {
    const commands = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of commands) {
      let command;
      try {
        command = JSON.parse(line);
      } catch {
        continue;
      }
      if (command?.type !== "transcribe" || !command.requestId || !command.audioPath) continue;
      try {
        const text = await transcribeWithPipeline(pipe, modelId, command.audioPath);
        emit({ type: "result", requestId: command.requestId, text });
      } catch (error) {
        emit({
          type: "request-error",
          requestId: command.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  if (!audioPath) return;
  emit({ type: "result", text: await transcribeWithPipeline(pipe, modelId, audioPath) });
}

main().catch((error) => {
  emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
