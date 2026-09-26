import type { SoundPreset } from "./types";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx?.state === "closed") ctx = null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

async function readyAudio(): Promise<AudioContext | null> {
  const ac = audio();
  if (!ac) return null;
  if (ac.state !== "running") {
    try {
      await ac.resume();
    } catch {
      return null;
    }
  }
  return ac.state === "running" ? ac : null;
}

type Tone = { f: number; d: number; type: OscillatorType; gain: number; delay?: number };

const PRESETS: Record<SoundPreset, Tone[]> = {
  electronic: [{ f: 880, d: 0.09, type: "square", gain: 0.18 }],
  high: [{ f: 1320, d: 0.08, type: "sine", gain: 0.22 }],
  metallic: [
    { f: 920, d: 0.12, type: "triangle", gain: 0.16 },
    { f: 1840, d: 0.08, type: "sine", gain: 0.08, delay: 0.02 },
  ],
  "metallic-tiny": [{ f: 1760, d: 0.05, type: "triangle", gain: 0.14 }],
  "double-chime": [
    { f: 660, d: 0.18, type: "sine", gain: 0.18 },
    { f: 990, d: 0.22, type: "sine", gain: 0.14, delay: 0.16 },
  ],
  double: [
    { f: 740, d: 0.1, type: "square", gain: 0.14 },
    { f: 740, d: 0.1, type: "square", gain: 0.1, delay: 0.14 },
  ],
};

async function beep(tones: Tone[], volume: number) {
  const ac = await readyAudio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const t of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type;
    osc.frequency.value = t.f;
    const start = now + (t.delay ?? 0);
    const peak = Math.max(0.0001, t.gain * volume);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.d);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(start);
    osc.stop(start + t.d + 0.02);
  }
}

export function playSignal(
  preset: SoundPreset,
  volume: number,
  pattern: "one" | "double" = "one",
) {
  const tones = PRESETS[preset] ?? PRESETS.electronic;
  void beep(tones, volume);
  if (pattern === "double") {
    window.setTimeout(
      () => void beep(tones.map((t) => ({ ...t, gain: t.gain * 0.85 })), volume),
      80,
    );
  }
}

export function unlockAudio() {
  void readyAudio();
}
