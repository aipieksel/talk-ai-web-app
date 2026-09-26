import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sounds = await readFile("src/lib/sounds.ts", "utf8");

test("signals wait for a running audio context and recreate a closed one", () => {
  assert.match(sounds, /if \(ctx\?\.state === "closed"\) ctx = null/);
  assert.match(sounds, /async function readyAudio/);
  assert.match(sounds, /if \(ac\.state !== "running"\)/);
  assert.match(sounds, /await ac\.resume\(\)/);
  assert.match(sounds, /return ac\.state === "running" \? ac : null/);
  assert.match(sounds, /const ac = await readyAudio\(\)/);
});

test("single and double signals use the resumed context path", () => {
  assert.match(sounds, /void beep\(tones, volume\)/);
  assert.match(sounds, /\(\) => void beep\(tones\.map/);
  assert.match(sounds, /export function unlockAudio\(\) \{\s+void readyAudio\(\)/);
});
