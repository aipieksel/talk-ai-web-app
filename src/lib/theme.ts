import { DEFAULT_THEME, type ThemeColors } from "./types";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function onColor(bg: string): string {
  return luminance(bg) > 0.45 ? "#141414" : "#F0F0F0";
}

export function mix(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${amount})`;
}

export function applyTheme(theme: ThemeColors) {
  if (typeof document === "undefined") return;
  const t = { ...DEFAULT_THEME, ...theme };
  const r = document.documentElement;
  r.style.setProperty("--color-background", t.background);
  r.style.setProperty("--color-foreground", t.foreground);
  r.style.setProperty("--color-card", t.surface);
  r.style.setProperty("--color-card-foreground", t.foreground);
  r.style.setProperty("--color-popover", t.surface);
  r.style.setProperty("--color-popover-foreground", t.foreground);
  r.style.setProperty("--color-primary", t.primary);
  r.style.setProperty("--color-primary-foreground", onColor(t.primary));
  r.style.setProperty("--color-secondary", mix(t.foreground, 0.06));
  r.style.setProperty("--color-secondary-foreground", t.foreground);
  r.style.setProperty("--color-muted", mix(t.foreground, 0.06));
  r.style.setProperty("--color-muted-foreground", mix(t.foreground, 0.55));
  r.style.setProperty("--color-accent", mix(t.foreground, 0.08));
  r.style.setProperty("--color-accent-foreground", t.foreground);
  r.style.setProperty("--color-destructive", t.danger);
  r.style.setProperty("--color-destructive-foreground", onColor(t.danger));
  r.style.setProperty("--color-border", mix(t.foreground, 0.12));
  r.style.setProperty("--color-input", mix(t.foreground, 0.12));
  r.style.setProperty("--color-ring", t.primary);
  r.style.setProperty("--color-live", t.danger);
  r.style.setProperty("--color-live-foreground", onColor(t.danger));
  r.style.setProperty("--color-ready", t.success);
  r.style.setProperty("--color-ready-foreground", onColor(t.success));
  r.style.setProperty("--color-brand-accent", t.accent);
  r.style.setProperty("--color-subtle", mix(t.foreground, 0.42));
  r.style.setProperty("--color-elevated", mix(t.foreground, 0.05));
  r.style.setProperty("--shadow-border", `0 0 0 1px ${mix(t.foreground, 0.08)}`);
  r.style.setProperty("--shadow-border-hover", `0 0 0 1px ${mix(t.foreground, 0.14)}`);
  r.style.colorScheme = luminance(t.background) < 0.45 ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.background);
}
