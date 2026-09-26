const LOCAL_TRUST_KEY = "talkai.local-trusted-session";

export function localTrustAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
}

export function getLocalTrustToken(): string | null {
  if (typeof window === "undefined" || !localTrustAvailable()) return null;
  try {
    return window.localStorage.getItem(LOCAL_TRUST_KEY);
  } catch {
    return null;
  }
}

export function saveLocalTrustToken(token: string): void {
  if (!localTrustAvailable()) throw new Error("Local trust is only available on this Mac.");
  window.localStorage.setItem(LOCAL_TRUST_KEY, token);
}

export function clearLocalTrustToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_TRUST_KEY);
  } catch {
    /* Storage unavailable. */
  }
}

export function localTrustEnabled(): boolean {
  return Boolean(getLocalTrustToken());
}
