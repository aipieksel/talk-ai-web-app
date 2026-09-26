import { create } from "zustand";
import { resetBrowserAccountState } from "@/lib/account";
import { useApp } from "@/stores/app";

const KEY = "talkai.guest";

function readFlag(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useGuest = create<{ on: boolean; enter: () => void; leave: () => Promise<void> }>((set) => ({
  on: readFlag(),
  enter: () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* */
    }
    resetBrowserAccountState();
    useApp.getState().resetAccount();
    set({ on: true });
  },
  leave: async () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* */
    }
    resetBrowserAccountState();
    useApp.getState().resetAccount();
    set({ on: false });
  },
}));
