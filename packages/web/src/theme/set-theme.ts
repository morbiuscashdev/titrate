/**
 * Pre-hydration theme setter. Runs as an inline <script> in index.html
 * before React mounts. Reads localStorage preference first; falls back
 * to OS preference via prefers-color-scheme. Writes `data-theme` on
 * documentElement so the CSS cascade resolves correctly before the first
 * paint (no flash of wrong theme).
 *
 * Three preferences are supported: "light", "dark", and "system". The
 * "system" preference tracks the OS `prefers-color-scheme` live. The
 * attribute written to the DOM is always the *resolved* value
 * ("light" | "dark"), never the literal string "system".
 */
export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "titrate-theme";

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked; no-op */
  }
}

export function detectInitialTheme(): Theme {
  return readStoredTheme() ?? "system";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolveTheme(theme);
  }
}
