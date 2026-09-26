import type { ThemeColors } from "./types";

export interface ThemePreset {
  id: string;
  name: string;
  hint: string;
  theme: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    hint: "Cool ink night, teal talk button, slate card.",
    theme: {
      primary: "#3EE0C4",
      accent: "#7C9CFF",
      background: "#070B14",
      surface: "#121A28",
      foreground: "#E8EEF8",
      success: "#34D399",
      danger: "#FB7185",
    },
  },
  {
    id: "ivory",
    name: "Ivory",
    hint: "Warm paper, ink text, terracotta controls.",
    theme: {
      primary: "#C2410C",
      accent: "#0F766E",
      background: "#F4EFE6",
      surface: "#FFFBF5",
      foreground: "#1C1917",
      success: "#047857",
      danger: "#B91C1C",
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    hint: "Phosphor green on a sealed black chassis.",
    theme: {
      primary: "#86EFAC",
      accent: "#4ADE80",
      background: "#050805",
      surface: "#0C120C",
      foreground: "#D8F3DC",
      success: "#4ADE80",
      danger: "#F87171",
    },
  },
  {
    id: "harbor",
    name: "Harbor",
    hint: "Deep navy, teal signal, quiet chrome.",
    theme: {
      primary: "#2DD4BF",
      accent: "#38BDF8",
      background: "#07111C",
      surface: "#0C1A28",
      foreground: "#E8F1F8",
      success: "#34D399",
      danger: "#FB7185",
    },
  },
  {
    id: "ember",
    name: "Ember",
    hint: "Lamp-lit charcoal and amber.",
    theme: {
      primary: "#E8A04A",
      accent: "#D97706",
      background: "#16110C",
      surface: "#1E1812",
      foreground: "#F6EDE2",
      success: "#86EFAC",
      danger: "#F87171",
    },
  },
  {
    id: "signal",
    name: "Signal",
    hint: "High-contrast black, white, and a single yellow LED.",
    theme: {
      primary: "#F5D90A",
      accent: "#F5D90A",
      background: "#000000",
      surface: "#111111",
      foreground: "#FAFAFA",
      success: "#4ADE80",
      danger: "#FF5C5C",
    },
  },
];

export function presetById(id: string | undefined): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

export function themeIdFor(theme: ThemeColors): string {
  const found = THEME_PRESETS.find((p) =>
    (Object.keys(p.theme) as (keyof ThemeColors)[]).every((k) => p.theme[k].toLowerCase() === theme[k].toLowerCase()),
  );
  return found?.id ?? "custom";
}
