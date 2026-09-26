import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "src/components/app-shell.tsx",
  "src/components/library-list.tsx",
  "src/components/history-detail.tsx",
  "src/components/recording-overlay.tsx",
  "src/components/insert-pad.tsx",
  "src/routes/index.tsx",
  "src/routes/settings.tsx",
  "src/routes/prompts.tsx",
  "src/routes/diagnostics.tsx",
  "src/routes/float.tsx",
  "src/routes/login.tsx",
  "src/routes/reset-password.tsx",
];

const sources = await Promise.all(
  files.map(async (file) => ({
    file,
    source: await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
  })),
);

test("important static DOM ids use the TalkAI prefix and remain unique", () => {
  const seen = new Map();
  for (const { file, source } of sources) {
    for (const match of source.matchAll(/\bid="([^"]+)"/g)) {
      const id = match[1];
      assert.match(id, /^talkai-[a-z0-9_-]+$/, `${file} contains an invalid static id: ${id}`);
      assert.equal(seen.has(id), false, `${id} is duplicated in ${seen.get(id)} and ${file}`);
      seen.set(id, file);
    }
  }
});

test("reusable surfaces expose semantic component hooks", () => {
  const combined = sources.map(({ source }) => source).join("\n");
  for (const hook of [
    "talkai-page-header",
    "talkai-navigation",
    "talkai-recording-dialog__waveform",
    "talkai-recording-dialog__content",
    "talkai-recording-dialog__actions",
    "talkai-recording-card",
    "talkai-settings-section",
    "talkai-prompt-editor",
    "talkai-empty-state",
  ]) {
    assert.match(combined, new RegExp(`\\b${hook}\\b`), `missing semantic hook ${hook}`);
  }
});

test("dynamic records use stable ids and data attributes", async () => {
  const names = await readFile(new URL("../src/lib/ui-names.ts", import.meta.url), "utf8");
  const library = sources.find(({ file }) => file.endsWith("library-list.tsx"))?.source ?? "";
  const prompts = sources.find(({ file }) => file.endsWith("prompts.tsx"))?.source ?? "";
  assert.match(names, /UI_PREFIX = "talkai"/);
  assert.match(names, /replace\(\/\[\^a-z0-9_-\]\+\/g, "-"\)/);
  assert.match(library, /uiDomId\("recording", item\.id\)/);
  assert.match(library, /data-recording-id=\{item\.id\}/);
  assert.match(prompts, /uiDomId\("prompt", p\.id\)/);
  assert.match(prompts, /data-prompt-id=\{p\.id\}/);
});

test("interactive selections expose simple state classes", () => {
  const combined = sources.map(({ source }) => source).join("\n");
  assert.match(combined, /is-active/);
  assert.match(combined, /is-selected/);
});
