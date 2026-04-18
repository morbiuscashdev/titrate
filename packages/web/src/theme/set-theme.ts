/**
 * Pre-hydration theme setter. Runs as an inline <script> in index.html
 * before React mounts. Reads localStorage preference first; falls back
 * to OS preference via prefers-color-scheme. Writes `data-theme` on
 * documentElement so the CSS cascade resolves correctly before the first
 * paint (no flash of wrong theme).
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "titrate-theme";

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
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
  const stored = readStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}
