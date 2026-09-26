const DB = "walkie-recordings";
const STORE = "blobs";
const DRAFTS = "drafts";

export interface AudioDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
  mime: string;
  live: string;
  elapsedMs: number;
  chunks: Blob[];
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
      if (!req.result.objectStoreNames.contains(DRAFTS)) {
        req.result.createObjectStore(DRAFTS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(id: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadRecording(id: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDraft(draft: AudioDraft): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFTS, "readwrite");
    tx.objectStore(DRAFTS).put(draft, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDraft(): Promise<AudioDraft | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS, "readonly");
      const req = tx.objectStore(DRAFTS).get("current");
      req.onsuccess = () => resolve((req.result as AudioDraft | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteDraft(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS, "readwrite");
      tx.objectStore(DRAFTS).delete("current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* */
  }
}

export async function wipeRecordings(): Promise<void> {
  await deleteDraft();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export function blobFromDraft(draft: AudioDraft): Blob | null {
  if (!draft.chunks.length) return null;
  return new Blob(draft.chunks, { type: draft.mime || "audio/webm" });
}
