export interface DesktopBridge {
  platform: string;
  which: (bin: string) => Promise<string | null>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  openFloat: () => Promise<void>;
  closeFloat: () => Promise<void>;
  savedLoginStatus: () => Promise<{ available: boolean; enabled: boolean }>;
  saveLogin: (email: string, password: string) => Promise<{ ok: true }>;
  getSavedLogin: () => Promise<{ email: string; password: string } | null>;
  clearSavedLogin: () => Promise<{ ok: true }>;
  modelDir?: string;
}

declare global {
  interface Window {
    walkie?: DesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.walkie);
}

export function desktop(): DesktopBridge | null {
  return typeof window !== "undefined" ? (window.walkie ?? null) : null;
}
