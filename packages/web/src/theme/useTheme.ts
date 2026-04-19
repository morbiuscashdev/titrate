import { useCallback, useEffect, useState } from "react";
import {
  type Theme,
  type ResolvedTheme,
  applyTheme,
  detectInitialTheme,
  resolveTheme,
  writeStoredTheme,
} from "./set-theme";

/**
 * Reads and changes the current theme preference.
 *
 * Theme is tri-state: "light" | "dark" | "system". When the preference
 * is "system", the resolved theme follows the OS `prefers-color-scheme`
 * and updates live when the OS preference changes.
 *
 * `theme` is the stored preference (useful for toggle UIs that need to
 * highlight the active option). `resolvedTheme` is what's actually in
 * effect ("light" | "dark"); use it to pick an icon/glyph.
 */
export function useTheme(): {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => detectInitialTheme());
  const [resolvedTheme, setResolvedState] = useState<ResolvedTheme>(() =>
    resolveTheme(detectInitialTheme()),
  );

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    writeStoredTheme(next);
    setThemeState(next);
    setResolvedState(resolveTheme(next));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  // When the preference is "system", mirror OS preference changes into
  // the DOM attribute and state so the UI re-renders with the new theme.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme !== "system") return;
      applyTheme("system");
      setResolvedState(resolveTheme("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, resolvedTheme, setTheme, toggle };
}
