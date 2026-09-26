import { sessionFields } from "@/lib/lock-client";
import { cleanupTranscript } from "@/lib/server/ai";
import type { CleanupExchange, PromptDoc } from "@/lib/types";
import { useApp } from "@/stores/app";

export async function runCleanup(
  raw: string,
  prompt: PromptDoc,
): Promise<
  | { ok: true; text: string; exchange: CleanupExchange | null }
  | { ok: false; error: string; exchange: CleanupExchange | null }
> {
  const settings = useApp.getState().settings;
  try {
    const result = await cleanupTranscript({
      data: {
        raw: raw.slice(0, 80_000),
        instructions: prompt.instructions,
        model: settings.model,
        provider: settings.provider,
        customEndpoint: settings.customEndpoint,
        localToolId: settings.localToolId,
        ...sessionFields(),
      },
    });
    if (result.ok) {
      return { ok: true, text: result.text, exchange: result.exchange ?? null };
    }
    return { ok: false, error: result.error, exchange: result.exchange ?? null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Cleanup failed.",
      exchange: null,
    };
  }
}
