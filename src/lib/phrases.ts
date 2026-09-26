function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\bokay\b/g, "ok")
    .replace(/\bkay\b/g, "ok")
    .replace(/\bokey\b/g, "ok")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function variantsFor(phrase: string, kind: "wake" | "send" | "insert"): string[] {
  const base = normalize(phrase);
  const set = new Set<string>([base]);
  if (kind === "wake") {
    if (base === "ok voice" || !phrase.trim()) {
      for (const v of ["ok voice", "ok vice", "ok boys", "okay voice"]) set.add(normalize(v));
    }
  }
  if (kind === "send") {
    if (base === "ok send" || base === "ok sent" || !phrase.trim() || /^ok send/.test(base)) {
      for (const v of [
        "ok send",
        "ok sent",
        "ok send it",
        "ok sending",
        "ok send now",
        "ok send this",
        "send it",
      ]) {
        set.add(normalize(v));
      }
    }
  }
  if (kind === "insert") {
    if (base === "insert" || !phrase.trim()) {
      for (const v of [
        "insert",
        "insect",
        "in set",
        "insert it",
        "and insert",
        "ok insert",
        "inside",
        "inserts",
        "and cert",
      ]) {
        set.add(normalize(v));
      }
    }
  }
  return [...set];
}

function matchesVariant(hay: string, variant: string): boolean {
  if (!variant) return false;
  if (hay === variant) return true;
  if (hay.endsWith(` ${variant}`) || hay.startsWith(`${variant} `) || hay.includes(` ${variant} `)) return true;
  const words = hay.split(" ");
  const need = variant.split(" ");
  if (words.length >= need.length) {
    const tail = words.slice(-need.length).join(" ");
    if (tail === variant) return true;
    const allow = variant.length >= 6 ? 1 : 0;
    if (allow && levenshtein(tail, variant) <= allow) return true;
  }
  if (variant.length >= 6 && levenshtein(hay, variant) <= 1) return true;
  return false;
}

export function phraseHeard(transcript: string, phrase: string, kind: "wake" | "send" | "insert"): boolean {
  const hay = normalize(transcript);
  if (!hay || !phrase.trim()) return false;
  return variantsFor(phrase, kind).some((v) => matchesVariant(hay, v));
}

export function displayShortcut(
  s: { key: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean },
  mac = true,
): string {
  const parts: string[] = [];
  if (mac) {
    if (s.ctrl) parts.push("⌃");
    if (s.alt) parts.push("⌥");
    if (s.shift) parts.push("⇧");
    if (s.meta) parts.push("⌘");
  } else {
    if (s.ctrl || s.meta) parts.push("Ctrl");
    if (s.alt) parts.push("Alt");
    if (s.shift) parts.push("Shift");
  }
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key === " " ? "Space" : s.key;
  parts.push(key);
  return mac ? parts.join("") : parts.join("+");
}

export function eventMatchesShortcut(
  e: KeyboardEvent,
  s: { key: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean },
): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const want = s.key.length === 1 ? s.key.toLowerCase() : s.key;
  if (key !== want) return false;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const meta = isMac ? e.metaKey : e.ctrlKey;
  const ctrl = isMac ? e.ctrlKey : false;
  if (Boolean(s.meta || (!isMac && s.ctrl)) !== meta) return false;
  if (isMac && s.ctrl !== ctrl) return false;
  if (s.alt !== e.altKey) return false;
  if (s.shift !== e.shiftKey) return false;
  return true;
}

export function shortcutFromEvent(
  e: KeyboardEvent,
): { key: string; meta: boolean; ctrl: boolean; alt: boolean; shift: boolean } | null {
  const hasMod = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
  if (!hasMod) return null;
  const skip = new Set(["Meta", "Control", "Alt", "Shift", "Dead"]);
  if (skip.has(e.key)) return null;
  let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "Escape") key = "Escape";
  if (key === "Enter") key = "Enter";
  if (key === " ") key = " ";
  return {
    key,
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}
