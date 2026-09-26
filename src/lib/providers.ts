import type { ProviderId } from "./types";

export type ProviderModel = { id: string; label: string };

export type ProviderDefinition = {
  id: ProviderId;
  label: string;
  defaultModel: string;
  baseUrl: string | null;
  envKey: string | null;
  models: ProviderModel[];
  local?: boolean;
  custom?: boolean;
};

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "xai",
    label: "xAI / Grok",
    defaultModel: "grok-4.5",
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    models: [
      { id: "grok-4.5", label: "Grok 4.5" },
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 Mini" },
      { id: "grok-2-1212", label: "Grok 2" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT OSS 20B" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    defaultModel: "mistral-small-latest",
    baseUrl: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "mistral-medium-latest", label: "Mistral Medium" },
      { id: "mistral-large-latest", label: "Mistral Large" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    envKey: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
  },
  {
    id: "together",
    label: "Together AI",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    baseUrl: "https://api.together.xyz/v1",
    envKey: "TOGETHER_API_KEY",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Turbo" },
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B Turbo" },
    ],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    envKey: "FIREWORKS_API_KEY",
    models: [
      {
        id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        label: "Llama 3.3 70B Instruct",
      },
      { id: "accounts/fireworks/models/deepseek-v3", label: "DeepSeek V3" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-5-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    models: [
      { id: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
      { id: "x-ai/grok-4", label: "xAI Grok 4" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  {
    id: "perplexity",
    label: "Perplexity",
    defaultModel: "sonar",
    baseUrl: "https://api.perplexity.ai",
    envKey: "PERPLEXITY_API_KEY",
    models: [
      { id: "sonar", label: "Sonar" },
      { id: "sonar-pro", label: "Sonar Pro" },
      { id: "sonar-reasoning-pro", label: "Sonar Reasoning Pro" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "local",
    label: "Local CLI",
    defaultModel: "",
    baseUrl: null,
    envKey: null,
    models: [],
    local: true,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    defaultModel: "",
    baseUrl: null,
    envKey: null,
    models: [],
    custom: true,
  },
] as const;

export const GROK_MODELS = PROVIDERS.find((provider) => provider.id === "xai")!.models;

export function providerDefinition(id: string | undefined): ProviderDefinition | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function modelsForProvider(id: string | undefined): ProviderModel[] {
  return [...(providerDefinition(id)?.models ?? [])];
}

export function isRemoteProvider(id: string | undefined): boolean {
  const provider = providerDefinition(id);
  return Boolean(provider && !provider.local);
}

export function normalizeProviderBase(providerId: string, customEndpoint?: string): string {
  const provider = providerDefinition(providerId);
  const raw = provider?.custom ? customEndpoint : provider?.baseUrl;
  const trimmed = raw?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) throw new Error("Custom endpoint is empty.");
  const withoutResource = trimmed.replace(/\/(?:chat\/completions|models)$/i, "");
  const url = new URL(withoutResource);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Provider endpoint must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

export function providerHeaders(providerId: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (providerId === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL?.trim()) {
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL.trim();
    }
    headers["X-Title"] = "Talk AI";
  }
  return headers;
}
