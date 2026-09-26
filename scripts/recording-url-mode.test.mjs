import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mode = await readFile(new URL("../src/lib/recording-url-mode.ts", import.meta.url), "utf8");
const shell = await readFile(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(
  new URL("../public/talkai-recording-mode.css", import.meta.url),
  "utf8",
);

test("record=1 is the shared auto-record and custom-style URL mode", () => {
  assert.match(mode, /get\("record"\) === "1"/);
  assert.match(shell, /const requested = isRecordingUrlMode\(searchStr\)/);
  assert.match(shell, /mountRecordingUrlStylesheet\(searchStr\)/);
});

test("recording URL mode loads a dedicated user-editable stylesheet", () => {
  assert.match(mode, /RECORDING_URL_STYLESHEET = "\/talkai-recording-mode\.css"/);
  assert.match(mode, /document\.head\.append\(stylesheet\)/);
  assert.match(mode, /talkai-recording-url-mode/);
  assert.match(stylesheet, /Custom styles for URLs opened with \?record=1/);
});
