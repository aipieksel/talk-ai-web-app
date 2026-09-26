import { resetBrowserAccountState, wipeWalkieStorageKeys } from "@/lib/account";
import { loadVault, saveVault, type VaultPayload } from "@/lib/server/vault";
import { useApp } from "@/stores/app";

let startedFor: string | null = null;
let applying = false;
let ready = false;
let timer: number | null = null;
let lastJson = "";
let unsub: (() => void) | null = null;

function payload(): VaultPayload {
  return { v: 1, ...useApp.getState().snapshot() };
}

async function push() {
  if (!ready || applying) return;
  if (!startedFor) return;
  if (useApp.getState().ownerUserId !== startedFor) return;
  const next = payload();
  const json = JSON.stringify(next);
  if (json === lastJson) return;
  try {
    const result = await saveVault({ data: { payload: next } });
    if (result.ok) lastJson = json;
  } catch {
    /* retry on next change */
  }
}

function schedule() {
  if (!ready || applying) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void push();
  }, 900);
}

export async function flushVault() {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  await push();
}

export function stopVaultSync() {
  startedFor = null;
  ready = false;
  unsub?.();
  unsub = null;
  if (timer) window.clearTimeout(timer);
  timer = null;
  lastJson = "";
  applying = false;
}

/** Flush the current account, wipe this browser, and drop in-memory state. */
export async function leaveAccount() {
  try {
    await flushVault();
  } catch {
    /* */
  }
  stopVaultSync();
  resetBrowserAccountState();
  useApp.getState().resetAccount();
}

export async function startVaultSync(userId: string) {
  if (startedFor === userId && ready) return;
  if (startedFor && startedFor !== userId) {
    try {
      await flushVault();
    } catch {
      /* */
    }
    stopVaultSync();
    resetBrowserAccountState();
  }

  startedFor = userId;
  unsub?.();
  unsub = null;
  ready = false;
  applying = false;
  lastJson = "";

  wipeWalkieStorageKeys();
  useApp.getState().resetAccount();

  try {
    const remote = await loadVault();
    if (startedFor !== userId) return;
    if (remote.ok && remote.payload) {
      applying = true;
      useApp.getState().hydrateCloud(remote.payload, userId);
      lastJson = JSON.stringify({ v: 1, ...useApp.getState().snapshot() });
      applying = false;
    } else if (remote.ok && !remote.payload) {
      const snap = useApp.getState().snapshot();
      if (remote.global) snap.settings = { ...snap.settings, ...remote.global };
      useApp.getState().hydrateCloud(snap, userId);
      lastJson = "";
      ready = true;
      await push();
    } else {
      useApp.getState().hydrateCloud(useApp.getState().snapshot(), userId);
    }
  } catch {
    applying = false;
    if (startedFor === userId) {
      useApp.getState().hydrateCloud(useApp.getState().snapshot(), userId);
    }
  }
  if (startedFor !== userId) return;
  ready = true;
  unsub = useApp.subscribe(() => schedule());
}
