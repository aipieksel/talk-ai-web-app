import { uid } from "./utils";
import type { LogEntry } from "./types";

const MAX = 250;
let buffer: LogEntry[] = [];

export function diag(cat: string, msg: string) {
  const entry: LogEntry = { id: uid(), t: new Date().toISOString(), cat, msg };
  buffer = [...buffer.slice(-(MAX - 1)), entry];
}

export function readLog(): LogEntry[] {
  return buffer;
}

export function clearLog() {
  buffer = [];
}

export function logText(): string {
  return buffer.map((e) => `${e.t}  ${e.cat.padEnd(14)}  ${e.msg}`).join("\n");
}
