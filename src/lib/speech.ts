type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  }
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer(): Recog | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  r.maxAlternatives = 1;
  return r;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

export function filenameForMime(mime: string): string {
  if (mime.includes("mp4")) return "recording.m4a";
  if (mime.includes("ogg")) return "recording.ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "recording.mp3";
  if (mime.includes("wav")) return "recording.wav";
  return "recording.webm";
}

export async function listMics(): Promise<{ deviceId: string; label: string }[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function micPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  if (typeof navigator === "undefined") return "unknown";
  try {
    if (navigator.permissions?.query) {
      const r = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (r.state === "granted" || r.state === "denied" || r.state === "prompt") return r.state;
    }
  } catch {
    /* Safari */
  }
  return "unknown";
}
