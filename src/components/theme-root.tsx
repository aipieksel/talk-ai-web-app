import { useEffect, useLayoutEffect } from "react";
import { applyTheme } from "@/lib/theme";
import { DEFAULT_THEME } from "@/lib/types";
import { useApp } from "@/stores/app";

export function ThemeRoot() {
  const theme = useApp((s) => s.settings.theme);
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    applyTheme(theme);
  }, [theme, hydrated]);
  return null;
}

/** Login / reset always use the product palette, never a leftover brown vault theme. */
export function AuthTheme() {
  useLayoutEffect(() => {
    applyTheme(DEFAULT_THEME);
  }, []);
  return null;
}
