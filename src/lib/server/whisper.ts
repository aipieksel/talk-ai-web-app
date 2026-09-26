/**
 * Whisper runs in an isolated Node worker (see `whisper-process.ts` and
 * `scripts/whisper-worker.mjs`). The VPS can keep that worker resident while
 * native Core ML runs remain short-lived.
 */
export {
  getWhisperModelStatus,
  startWhisperModel,
  warmWhisperModel,
  transcribeWithWhisper,
  type WhisperServerPhase,
  type WhisperServerStatus,
} from "./whisper-process";
