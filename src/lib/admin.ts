/** Server-side owner configuration; never include it in a VITE_ variable. */
export const ADMIN_EMAIL = process.env.TALKAI_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(ADMIN_EMAIL) && (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

export const GLOBAL_SETTING_KEYS = [
  "transcribeEngine",
  "whisperModel",
  "cleanupEnabled",
  "provider",
  "model",
  "customEndpoint",
  "localToolId",
  "overlayMode",
  "floatX",
  "floatY",
  "diagnosticLogging",
] as const;

export type GlobalSettingKey = (typeof GLOBAL_SETTING_KEYS)[number];

export function pickGlobalSettings<T extends Record<string, unknown>>(
  settings: T,
): Pick<T, GlobalSettingKey> {
  const out = {} as Pick<T, GlobalSettingKey>;
  for (const key of GLOBAL_SETTING_KEYS) {
    if (key in settings) (out as Record<string, unknown>)[key] = settings[key];
  }
  return out;
}
