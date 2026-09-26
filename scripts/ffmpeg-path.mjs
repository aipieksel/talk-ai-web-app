import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

async function isExecutable(path) {
  if (!path) return false;
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveFfmpegPath(env = process.env) {
  const configured = env.TALKAI_FFMPEG_PATH?.trim();
  if (configured) {
    if (await isExecutable(configured)) return configured;
    throw new Error(`TALKAI_FFMPEG_PATH is not executable: ${configured}`);
  }

  if (await isExecutable(ffmpegStatic)) return ffmpegStatic;

  const pathCandidates = (env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, "ffmpeg"));
  for (const candidate of pathCandidates) {
    if (await isExecutable(candidate)) return candidate;
  }

  throw new Error(
    "FFmpeg is unavailable. Reinstall TalkAI dependencies or set TALKAI_FFMPEG_PATH to an executable FFmpeg binary.",
  );
}
