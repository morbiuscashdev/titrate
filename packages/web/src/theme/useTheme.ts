import { useCallback, useEffect, useState } from "react";
import { type Theme, applyTheme, detectInitialTheme, writeStoredTheme } from "./set-theme";

/**
 * Reads and toggles the current brutalist surface theme.
 * Source of truth: `document.documentElement.dataset.theme` (set by the
 * pre-hydration script). Updates flow: toggle -> applyTheme(next) ->
 * writeStoredTheme(next) -> setState(next) so rerenders follow the DOM.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.dataset.theme;
      if (attr === "light" || attr === "dark") return attr;
    }
    return detectInitialTheme();
  });

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    writeStoredTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Sync with OS preference changes when no explicit user choice is stored.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem("titrate-theme")) return;
      } catch { /* storage blocked; honor OS */ }
      const next: Theme = e.matches ? "dark" : "light";
      applyTheme(next);
      setThemeState(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return { theme, setTheme, toggle };
}
