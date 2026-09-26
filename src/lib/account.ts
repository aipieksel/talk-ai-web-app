import { clearSessionToken } from "@/lib/lock-client";
import { wipeRecordings } from "@/lib/idb";

const KEEP = [/^walkie-whisper-ready:/, /^grok-auth\./];

function shouldKeep(key: string) {
  return KEEP.some((re) => re.test(key));
}

function sweepStorage(store: Storage) {
  const remove: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    if (key.startsWith("walkie") && !shouldKeep(key)) remove.push(key);
  }
  for (const key of remove) store.removeItem(key);
}

/** Remove Walkie keys from Web Storage. Does not touch IndexedDB or auth tokens. */
export function wipeWalkieStorageKeys() {
  if (typeof window === "undefined") return;
  try {
    sweepStorage(window.localStorage);
  } catch {
    /* */
  }
  try {
    sweepStorage(window.sessionStorage);
  } catch {
    /* */
  }
}

/** Wipe every Walkie user artifact in this browser. Auth cookies/tokens are separate. */
export async function wipeBrowserUserData() {
  resetBrowserAccountState();
  await wipeRecordings();
}

/** Clear account-scoped state without destroying locally saved source audio. */
export function resetBrowserAccountState() {
  wipeWalkieStorageKeys();
  try {
    clearSessionToken();
  } catch {
    /* */
  }
}
