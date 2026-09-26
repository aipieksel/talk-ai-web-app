import { create } from "zustand";
import { clearSessionToken, getSessionToken, persistSessionToken } from "@/lib/lock-client";
import { lockLogin, lockLogout, lockSetup, lockStatus } from "@/lib/server/lock";

const OFF_FLAG = "walkie.lock-off";

function wasUnlocked(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(OFF_FLAG) === "1";
  } catch {
    return false;
  }
}

function markUnlocked(off: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (off) sessionStorage.setItem(OFF_FLAG, "1");
    else sessionStorage.removeItem(OFF_FLAG);
  } catch {
    /* */
  }
}

interface SessionState {
  ready: boolean;
  enabled: boolean;
  unlocked: boolean;
  username: string;
  sessionHours: number;
  refresh: () => Promise<void>;
  login: (username: string, password: string, remember: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  setup: (input: {
    username: string;
    password: string;
    sessionHours: number;
    currentPassword?: string;
    enable: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}

/** Stay locked until lockStatus resolves — never paint the app first. */
export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  enabled: false,
  unlocked: false,
  username: "",
  sessionHours: 168,
  refresh: async () => {
    try {
      const status = await lockStatus({ data: { sessionToken: getSessionToken() } });
      markUnlocked(!status.enabled || status.unlocked);
      set({
        ready: true,
        enabled: status.enabled,
        unlocked: status.unlocked,
        username: status.username,
        sessionHours: status.sessionHours,
      });
    } catch {
      markUnlocked(false);
      set((s) => ({
        ready: true,
        enabled: s.enabled,
        unlocked: s.enabled ? false : true,
      }));
    }
  },
  login: async (username, password, remember) => {
    try {
      const result = await lockLogin({ data: { username, password, remember } });
      if (!result.ok) return { ok: false, error: result.error };
      persistSessionToken(result.token, remember);
      markUnlocked(true);
      set({
        enabled: true,
        unlocked: true,
        username: result.username,
        sessionHours: result.sessionHours,
        ready: true,
      });
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not sign in." };
    }
  },
  logout: async () => {
    try {
      await lockLogout({ data: { sessionToken: getSessionToken() } });
    } catch {
      /* */
    }
    clearSessionToken();
    markUnlocked(false);
    if (get().enabled) set({ unlocked: false, username: "" });
  },
  setup: async (input) => {
    try {
      const result = await lockSetup({
        data: { ...input, sessionToken: getSessionToken() },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (result.enabled && "token" in result && result.token) {
        persistSessionToken(result.token, true);
        markUnlocked(true);
        set({
          enabled: true,
          unlocked: true,
          username: result.username,
          sessionHours: "sessionHours" in result ? result.sessionHours : get().sessionHours,
        });
      } else {
        clearSessionToken();
        markUnlocked(true);
        set({ enabled: false, unlocked: true, username: "" });
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not update sign-in." };
    }
  },
}));
