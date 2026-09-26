import { createServerFn } from "@tanstack/react-start";
import { LOCAL_TOOLS } from "@/lib/types";
import { assertUnlocked } from "@/lib/server/lock";

const ALLOWED = new Set(LOCAL_TOOLS.map((t) => t.bin));

async function which(bin: string): Promise<string | null> {
  if (!ALLOWED.has(bin)) return null;
  const { execFile } = await import("node:child_process");
  const { constants } = await import("node:fs");
  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync("which", [bin], { timeout: 2500 });
    const path = stdout.trim();
    if (path) return path;
  } catch {
    /* Check common CLI locations when a GUI launch has a minimal PATH. */
  }
  const candidates = [
    join(homedir(), ".local", "bin", bin),
    join(homedir(), ".npm-global", "bin", bin),
    join("/opt/homebrew/bin", bin),
    join("/usr/local/bin", bin),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try the next known CLI directory. */
    }
  }
  return null;
}

export const discoverLocalTools = createServerFn({ method: "POST" })
  .validator((input: { sessionToken?: string } = {}) => input ?? {})
  .handler(async ({ data }) => {
    const denied = await assertUnlocked(data?.sessionToken);
    if (denied)
      return {
        ok: false as const,
        error: denied,
        tools: [] as Array<(typeof LOCAL_TOOLS)[number] & { path: string | null; found: boolean }>,
      };
    const results = await Promise.all(
      LOCAL_TOOLS.map(async (t) => {
        const path = await which(t.bin);
        return { ...t, path, found: Boolean(path) };
      }),
    );
    return { ok: true as const, tools: results };
  });

export const runLocalCleanup = createServerFn({ method: "POST" })
  .validator((input: { toolId: string; instructions: string; raw: string }) => input)
  .handler(async ({ data }) => {
    const tool = LOCAL_TOOLS.find((t) => t.id === data.toolId);
    if (!tool) return { ok: false as const, error: "Unknown local tool." };
    const path = await which(tool.bin);
    if (!path) {
      return {
        ok: false as const,
        error: `${tool.label} was not found on this machine. Install it and restart Talk AI.`,
      };
    }

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const prompt = `${data.instructions}\n\nTranscript:\n${data.raw}`;
    const requestAt = new Date().toISOString();
    let args: string[] = [];

    switch (tool.id) {
      case "ollama":
        args = ["run", "llama3.2", prompt];
        break;
      case "claude":
        args = ["-p", prompt, "--output-format", "text"];
        break;
      case "codex":
        args = [
          "exec",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--ephemeral",
          "--color",
          "never",
          prompt,
        ];
        break;
      case "gemini":
        args = ["-p", prompt];
        break;
      case "grok":
        args = ["-p", prompt];
        break;
      case "aider":
        args = ["--message", prompt, "--yes-always"];
        break;
      default:
        args = [prompt];
    }

    try {
      const { stdout, stderr } = await execFileAsync(path, args, {
        timeout: tool.id === "codex" ? 90_000 : 30_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const text = (stdout || stderr || "").trim();
      if (!text) return { ok: false as const, error: `${tool.label} returned empty output.` };
      return {
        ok: true as const,
        text,
        exchange: {
          provider: "local",
          model: tool.id,
          endpoint: path,
          requestAt,
          responseAt: new Date().toISOString(),
          httpStatus: 200,
          requestJson: JSON.stringify({ tool: tool.id, args }, null, 2),
          responseJson: text.slice(0, 8000),
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${tool.label} failed.`;
      return { ok: false as const, error: msg.replace(path, tool.bin) };
    }
  });
