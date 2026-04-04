import { createContext, useContext, useState, useEffect, useCallback } from 'react';

/** Persisted theme preference — 'system' defers to OS setting. */
export type Theme = 'light' | 'dark' | 'system';

/** Values exposed by the theme context. */
export type ThemeContextValue = {
  readonly theme: Theme;
  readonly resolvedTheme: 'light' | 'dark';
  readonly setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = 'titrate-theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Read the stored theme preference from localStorage.
 * Falls back to 'system' when no value is stored or value is invalid.
 */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (SSR, privacy mode)
  }
  return 'system';
}

/** Resolve 'system' to a concrete 'light' | 'dark' value. */
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

/** Apply or remove the `dark` class on the root element. */
function applyDarkClass(resolved: 'light' | 'dark'): void {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export type ThemeProviderProps = {
  readonly children: React.ReactNode;
};

/**
 * Provides theme state to the component tree.
 *
 * Reads the initial preference from `localStorage`, resolves 'system' via
 * `prefers-color-scheme`, and keeps the `dark` class on `<html>` in sync.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolveTheme(theme),
  );

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable
    }
    setThemeState(next);
  }, []);

  // Resolve theme and apply dark class whenever `theme` changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyDarkClass(resolved);

    if (theme !== 'system') {
      return;
    }

    // Listen for OS-level changes while in system mode
    const mql = window.matchMedia(MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyDarkClass(next);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Access the current theme context.
 *
 * @throws When called outside of a `<ThemeProvider>`.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
