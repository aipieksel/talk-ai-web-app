import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveFfmpegPath } from "./ffmpeg-path.mjs";

test("resolves the bundled FFmpeg when PATH is empty", async () => {
  const resolved = await resolveFfmpegPath({ PATH: "" });
  await access(resolved, constants.X_OK);
  assert.match(resolved, /ffmpeg/);
});

test("prefers an explicitly configured FFmpeg", async () => {
  const work = await mkdtemp(join(tmpdir(), "talkai-ffmpeg-test-"));
  const executable = join(work, "custom-ffmpeg");
  try {
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o700);
    assert.equal(await resolveFfmpegPath({ TALKAI_FFMPEG_PATH: executable, PATH: "" }), executable);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("rejects a broken TALKAI_FFMPEG_PATH without silently falling back", async () => {
  await assert.rejects(
    resolveFfmpegPath({ TALKAI_FFMPEG_PATH: "/missing/talkai-ffmpeg", PATH: "" }),
    /TALKAI_FFMPEG_PATH is not executable/,
  );
});
