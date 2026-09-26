import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const whisper = await readFile(
  new URL("../src/lib/server/whisper-process.ts", import.meta.url),
  "utf8",
);

test("the VPS can make Whisper resident before accepting recordings", () => {
  assert.match(vite, /TALKAI_PREWARM_WHISPER_MODEL/);
  assert.match(vite, /await whisper\.warmWhisperModel\(requested\)/);
  assert.match(vite, /whisperPrewarmPlugin\(\)/);
  assert.match(whisper, /export function warmWhisperModel/);
  assert.match(whisper, /return job/);
});
