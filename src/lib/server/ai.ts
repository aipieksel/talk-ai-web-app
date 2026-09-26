import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import {
  modelsForProvider,
  normalizeProviderBase,
  providerDefinition,
  providerHeaders,
  type ProviderModel,
} from "@/lib/providers";
import { assertUnlocked } from "@/lib/server/lock";
import { cleanupLooksUnsafe, cleanupMessages } from "@/lib/server/cleanup-contract";
import type { ProviderId, TranscribeEngine, WhisperModelId } from "@/lib/types";

const XAI = "https://api.x.ai/v1";

async function withServerTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripCleanup(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(
    /^(here is the cleaned transcript|cleaned transcript|sure[,.]? here(?:'s| is)(?: the)? cleaned(?: up)? (?:transcript|text)):\s*/i,
    "",
  );
  const fence = cleaned.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fence?.[1]) cleaned = fence[1].trim();
  return cleaned.trim();
}

function providerError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function responseContent(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function mergeModels(providerId: string, ids: string[]): ProviderModel[] {
  const curated = modelsForProvider(providerId);
  const labels = new Map(curated.map((model) => [model.id, model.label]));
  return [...new Set([...curated.map((model) => model.id), ...ids])]
    .filter(Boolean)
    .map((id) => ({ id, label: labels.get(id) ?? id }));
}

async function fetchProviderModels(
  providerId: string,
  customEndpoint: string | undefined,
  apiKey: string,
): Promise<ProviderModel[]> {
  const base = normalizeProviderBase(providerId, customEndpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${base}/models`, {
      headers: providerHeaders(providerId, apiKey),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: unknown = {};
    try {
      body = JSON.parse(raw);
    } catch {
      if (!response.ok) throw new Error(`Connection failed (${response.status}).`);
      throw new Error("The provider returned a non-JSON model list.");
    }
    if (!response.ok)
      throw new Error(providerError(body, `Connection failed (${response.status}).`));
    const candidate = body as {
      data?: { id?: unknown; name?: unknown }[];
      models?: { id?: unknown; name?: unknown }[];
    };
    const rows = Array.isArray(candidate.data)
      ? candidate.data
      : Array.isArray(candidate.models)
        ? candidate.models
        : [];
    const ids = rows
      .map((model) => {
        const value =
          typeof model.id === "string"
            ? model.id
            : typeof model.name === "string"
              ? model.name
              : "";
        return value.replace(/^models\//, "");
      })
      .filter(Boolean);
    return mergeModels(providerId, ids);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Connection test timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const prepareWhisperModel = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((input: { whisperModel: WhisperModelId }) => input)
  .handler(async ({ data }) => {
    const whisper = await import("./whisper");
    whisper.startWhisperModel(data.whisperModel);
    return whisper.getWhisperModelStatus(data.whisperModel);
  });

export const whisperModelStatus = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((input: { whisperModel: WhisperModelId }) => input)
  .handler(async ({ data }) => {
    const whisper = await import("./whisper");
    return whisper.getWhisperModelStatus(data.whisperModel);
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(
    (input: {
      audioBase64: string;
      mimeType: string;
      filename: string;
      sessionToken?: string;
      engine?: TranscribeEngine;
      whisperModel?: WhisperModelId;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!context.isGuest) {
      const denied = await assertUnlocked(data.sessionToken);
      if (denied) return { ok: false as const, error: denied };
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!data.audioBase64) return { ok: false as const, error: "No audio was captured." };
    const bytes = Buffer.from(data.audioBase64, "base64");
    if (bytes.byteLength > 8 * 1024 * 1024) {
      return { ok: false as const, error: "Recording is too large to transcribe." };
    }
    if (data.engine === "whisper") {
      try {
        const { transcribeWithWhisper } = await import("./whisper");
        const text = await withServerTimeout(
          transcribeWithWhisper(bytes, data.whisperModel || "base.en"),
          600_000,
          "Whisper transcription timed out after 10 minutes. The recording is still saved; try the Base English model.",
        );
        return { ok: true as const, text, language: "en", duration: 0, engine: "whisper" as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Whisper failed.";
        if (!apiKey) return { ok: false as const, error: message };
      }
    }
    if (!apiKey) {
      return {
        ok: false as const,
        error: "Grok transcription is not available in this environment.",
      };
    }
    const form = new FormData();
    form.append("language", "en");
    form.append("format", "true");
    form.append(
      "file",
      new Blob([bytes], { type: data.mimeType || "application/octet-stream" }),
      data.filename || "recording.webm",
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(`${XAI}/stt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Grok transcription timed out."
            : "Grok transcription request failed.",
      };
    } finally {
      clearTimeout(timer);
    }
    const raw = await response.text();
    let body: { text?: string; language?: string; duration?: number; error?: string } = {};
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return { ok: false as const, error: `Transcription failed (${response.status}).` };
    }
    if (!response.ok) {
      return {
        ok: false as const,
        error: body.error || `Transcription failed (${response.status}).`,
      };
    }
    return {
      ok: true as const,
      text: (body.text ?? "").trim(),
      language: body.language ?? "en",
      duration: body.duration ?? 0,
    };
  });

export const getProviderCredentialStatuses = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sessionToken?: string } = {}) => input ?? {})
  .handler(async ({ context, data }) => {
    const denied = await assertUnlocked(data.sessionToken);
    if (denied) return { ok: false as const, error: denied, statuses: [] };
    const { assertAdmin } = await import("./global-settings");
    await assertAdmin(context.userId);
    const { providerCredentialStatuses } = await import("./provider-credentials.server");
    return { ok: true as const, statuses: await providerCredentialStatuses() };
  });

export const listProviderModels = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { provider: ProviderId; customEndpoint?: string; sessionToken?: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const denied = await assertUnlocked(data.sessionToken);
    const curated = modelsForProvider(data.provider);
    if (denied) return { ok: false as const, error: denied, models: curated };
    const { assertAdmin } = await import("./global-settings");
    await assertAdmin(context.userId);
    const definition = providerDefinition(data.provider);
    if (!definition || definition.local) {
      return {
        ok: false as const,
        error: "This provider has no remote model catalog.",
        models: curated,
      };
    }
    const { getProviderCredential } = await import("./provider-credentials.server");
    const key = await getProviderCredential(data.provider);
    if (!key)
      return {
        ok: false as const,
        error: `No ${definition.label} API key is saved.`,
        models: curated,
      };
    try {
      return {
        ok: true as const,
        models: await fetchProviderModels(data.provider, data.customEndpoint, key),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Could not load models.",
        models: curated,
      };
    }
  });

export const cleanupTranscript = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(
    (input: {
      raw: string;
      instructions: string;
      model?: string;
      provider?: ProviderId;
      customEndpoint?: string;
      localToolId?: string;
      sessionToken?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!context.isGuest) {
      const denied = await assertUnlocked(data.sessionToken);
      if (denied) return { ok: false as const, error: denied };
    }
    const raw = data.raw.trim();
    if (!raw) return { ok: false as const, error: "Nothing to clean up." };
    if (data.provider === "local") {
      const { runLocalCleanup } = await import("./local-tools");
      return runLocalCleanup({
        data: {
          toolId: data.localToolId || data.model || "",
          instructions: data.instructions,
          raw,
        },
      });
    }
    const provider = data.provider ?? "xai";
    const definition = providerDefinition(provider);
    if (!definition || definition.local)
      return { ok: false as const, error: "Unknown cleanup provider." };
    const model = data.model?.trim() || definition.defaultModel;
    if (!model) return { ok: false as const, error: "Model is empty." };
    let base: string;
    try {
      base = normalizeProviderBase(provider, data.customEndpoint);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Provider endpoint is invalid.",
      };
    }
    const { getProviderCredential } = await import("./provider-credentials.server");
    let apiKey = "";
    try {
      apiKey = await getProviderCredential(provider);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Credential could not be opened.",
      };
    }
    if (!apiKey) return { ok: false as const, error: `No ${definition.label} API key is saved.` };

    const maxTokens = Math.min(8192, Math.max(1024, Math.ceil(raw.length / 2)));
    const endpoint = `${base}/chat/completions`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestAt = new Date().toISOString();
      const body: Record<string, unknown> = {
        model,
        temperature: attempt === 0 ? 0.2 : 0,
        stream: false,
        max_tokens: maxTokens,
        messages: cleanupMessages(raw, data.instructions, attempt === 1),
      };
      if (provider === "deepseek") body.thinking = { type: "disabled" };
      const prettyRequest = JSON.stringify(body, null, 2);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...providerHeaders(provider, apiKey) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        return {
          ok: false as const,
          error:
            error instanceof Error && error.name === "AbortError"
              ? "Cleanup timed out."
              : "Cleanup request failed.",
        };
      }
      clearTimeout(timer);
      const responseAt = new Date().toISOString();
      const rawResponse = await response.text();
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        return {
          ok: false as const,
          error: `Cleanup returned non-JSON (${response.status}).`,
          exchange: {
            provider,
            model,
            endpoint,
            requestAt,
            responseAt,
            httpStatus: response.status,
            requestJson: prettyRequest,
            responseJson: rawResponse.slice(0, 8000),
          },
        };
      }
      const exchange = {
        provider,
        model,
        endpoint,
        requestAt,
        responseAt,
        httpStatus: response.status,
        requestJson: prettyRequest,
        responseJson: JSON.stringify(parsed, null, 2),
      };
      if (!response.ok) {
        return {
          ok: false as const,
          error: providerError(parsed, `Cleanup failed (${response.status}).`),
          exchange,
        };
      }
      const text = stripCleanup(responseContent(parsed));
      if (!text) return { ok: false as const, error: "Cleanup returned empty text.", exchange };
      if (cleanupLooksUnsafe(raw, text)) {
        if (attempt === 0) continue;
        return {
          ok: false as const,
          error:
            "Cleanup tried to answer or expand the transcript. The raw transcript was preserved.",
          exchange,
        };
      }
      return { ok: true as const, text, exchange };
    }
    return { ok: false as const, error: "Cleanup failed." };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      provider: ProviderId;
      customEndpoint?: string;
      apiKey?: string;
      save?: boolean;
      localToolId?: string;
      sessionToken?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const denied = await assertUnlocked(data.sessionToken);
    if (denied) return { ok: false as const, error: denied, models: [] as ProviderModel[] };
    const { assertAdmin } = await import("./global-settings");
    await assertAdmin(context.userId);
    if (data.provider === "local") {
      const { discoverLocalTools } = await import("./local-tools");
      const result = await discoverLocalTools({ data: { sessionToken: data.sessionToken } });
      if (!result.ok)
        return { ok: false as const, error: result.error, models: [] as ProviderModel[] };
      const tool = result.tools.find((candidate) => candidate.id === data.localToolId);
      if (!tool)
        return { ok: false as const, error: "Pick a local CLI.", models: [] as ProviderModel[] };
      if (!tool.found) {
        return {
          ok: false as const,
          error: `${tool.label} is not installed.`,
          models: [] as ProviderModel[],
        };
      }
      return {
        ok: true as const,
        message: `Found ${tool.label} at ${tool.path}`,
        models: [] as ProviderModel[],
        saved: false,
      };
    }
    const definition = providerDefinition(data.provider);
    if (!definition)
      return { ok: false as const, error: "Unknown provider.", models: [] as ProviderModel[] };
    const { getProviderCredential, saveProviderCredential } =
      await import("./provider-credentials.server");
    const draft = data.apiKey?.trim() ?? "";
    let key = draft;
    if (!key) {
      try {
        key = await getProviderCredential(data.provider);
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Credential could not be opened.",
          models: [] as ProviderModel[],
        };
      }
    }
    if (!key) {
      return {
        ok: false as const,
        error: `No ${definition.label} API key is saved.`,
        models: modelsForProvider(data.provider),
      };
    }
    try {
      const models = await fetchProviderModels(data.provider, data.customEndpoint, key);
      let saved = false;
      let lastFour = key.slice(-4);
      if (data.save && draft) {
        lastFour = await saveProviderCredential(data.provider, draft);
        saved = true;
      }
      return {
        ok: true as const,
        message: `${saved ? "Saved · " : "Connected · "}${models.length} models`,
        models,
        saved,
        lastFour,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Connection failed.",
        models: modelsForProvider(data.provider),
      };
    }
  });
