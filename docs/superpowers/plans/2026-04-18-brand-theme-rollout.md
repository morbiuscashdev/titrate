# Brand & Theme Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the brand/theme system from `docs/superpowers/specs/2026-04-18-brand-theme-design.md` — tokens, SVG mark, favicon, theme switching infra, a 15-component primitive library in `packages/web/src/components/ui/`, and a matching TUI theme module with ANSI-256 color mapping, symbols, and an ASCII splash banner.

**Architecture:** Tailwind v4 CSS-first `@theme` layer holds tokens; `[data-mode]` and `[data-theme]` attribute cascades switch operator-vs-brutalist and light-vs-dark variants; a pre-hydration inline script sets `data-theme` before React mounts so there's no flash. Components in `packages/web/src/components/ui/` read `data-mode` via context (via `useMode()`) and return different JSX per mode. TUI ships a typed `theme/` module that OpenTUI color props import from — no inline hex anywhere in TUI after this plan lands.

**Tech Stack:** Tailwind v4 (CSS-first `@theme`), React 19, Vitest + @testing-library/react + jsdom (web tests), Bun + bun:test (TUI tests), OpenTUI, IBM Plex Sans + IBM Plex Mono + IBM Plex Serif (via Google Fonts).

---

## File structure

### New files (created by this plan)

**Foundation:**
- `packages/web/public/mark.svg` — canonical titration-curve SVG
- `packages/web/public/mark-tile.svg` — favicon-sized tile wrapper
- `packages/web/public/mark-tile.png` — PNG fallback (1× + 2× embedded)
- `packages/web/src/theme/set-theme.ts` — pre-hydration `data-theme` setter
- `packages/web/src/theme/useTheme.ts` — React hook: read + toggle `data-theme`
- `packages/web/src/theme/useMode.ts` — React hook: read current `data-mode` from DOM ancestor
- `packages/web/src/theme/index.ts` — barrel

**Component library** (all under `packages/web/src/components/ui/`):
- `Mark.tsx` — inline SVG mark
- `Wordmark.tsx` — Mark + "titrate"
- `Button.tsx` — 4 variants × 2 modes × 3 sizes × 4 states
- `BlockCaret.tsx` — blinking pink block caret for operator inputs
- `Input.tsx` — text input with BlockCaret on focus
- `Textarea.tsx` — multi-line input
- `Select.tsx` — native select wrapped in brutalist/operator chrome
- `Checkbox.tsx`
- `Pill.tsx` — semantic status pill (operator) + brutalist status pill
- `Chip.tsx` — brutalist verb chip (yellow/green/pink)
- `Card.tsx` — operator entity card + brutalist hero/summary card
- `StatCard.tsx` — brutalist-only, large-number + label
- `DataTable.tsx` — operator default + brutalist variant
- `OperatorPanel.tsx` — dark ink surface with mode-aware outer frame
- `AppShell.tsx` — top-level brutalist chrome (nav + page wrapper)
- `ThemeToggle.tsx` — manual dark/light switch
- `index.ts` — barrel export

**TUI theme module** (all under `packages/tui/src/theme/`):
- `colors.ts` — ANSI-256 color map
- `symbols.ts` — `∫`, `•`, `✓`, `✗`, etc.
- `splash.ts` — three-line ASCII titration-curve banner
- `index.ts` — barrel

### Modified files

- `packages/web/index.html` — add IBM Plex font `<link>`, replace favicon, add pre-hydration `<script>`
- `packages/web/src/index.css` — replace with full `@theme` layer (tokens + cascades)
- `packages/web/src/main.tsx` — no change (set-theme runs in `index.html` before React mounts)

---

## Task 1: Add IBM Plex Sans/Mono/Serif to index.html + update theme-color

**Files:**
- Modify: `packages/web/index.html`

- [ ] **Step 1: Open the file to confirm current state**

Read `packages/web/index.html`. Current `<head>` contains existing icon links and a CSP that already allows `fonts.googleapis.com` and `fonts.gstatic.com`.

- [ ] **Step 2: Add Google Fonts preconnect + stylesheet above the title**

Insert these three `<link>` elements on a new line right before `<title>Titrate</title>`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700;800&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap">
```

- [ ] **Step 3: Update theme-color meta**

Replace `<meta name="theme-color" content="#1e293b" />` with:

```html
    <meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#fefce8" media="(prefers-color-scheme: light)">
```

- [ ] **Step 4: Verify build still passes**

Run: `cd packages/web && yarn build`
Expected: exit code 0; bundle sizes reported; no CSP violation warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/web/index.html
git commit -m "feat(web): load IBM Plex Sans/Mono/Serif and update theme-color for dark/light"
```

---

## Task 2: Create the canonical `mark.svg` asset

**Files:**
- Create: `packages/web/public/mark.svg`

- [ ] **Step 1: Write the SVG file**

Write `packages/web/public/mark.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 150" fill="none" role="img" aria-label="titrate">
  <path d="M 14 120 L 65 120 L 95 30 L 156 30" stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"/>
  <circle cx="80" cy="75" r="22" stroke="currentColor" stroke-width="8"/>
</svg>
```

- [ ] **Step 2: Verify it renders**

Run: `ls -la packages/web/public/mark.svg`
Expected: file size ~300 bytes; exists and readable.

Open the file in a browser directly (`file:///.../packages/web/public/mark.svg`) — the curve should render as a black `_/` with a hollow circle at the inflection. (`currentColor` defaults to `black` when no parent sets a color.)

- [ ] **Step 3: Commit**

```bash
git add packages/web/public/mark.svg
git commit -m "feat(web): add canonical titration-curve SVG mark"
```

---

## Task 3: Create `mark-tile.svg` favicon (brutalist mini-tile)

**Files:**
- Create: `packages/web/public/mark-tile.svg`

- [ ] **Step 1: Write the favicon SVG**

Write `packages/web/public/mark-tile.svg` — a 32×32 tile with cream background, cream-900 border, and the mark centered. Scale `viewBox` so the tile reads legibly at favicon size:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="titrate">
  <rect x="1" y="1" width="30" height="30" fill="#fefce8" stroke="#171717" stroke-width="2"/>
  <g transform="translate(6.5 8) scale(0.115)">
    <path d="M 14 120 L 65 120 L 95 30 L 156 30" stroke="#d63384" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
    <circle cx="80" cy="75" r="22" stroke="#d63384" stroke-width="8" fill="none"/>
  </g>
</svg>
```

- [ ] **Step 2: Verify by opening in browser**

Open `file:///.../packages/web/public/mark-tile.svg` — should render as a cream 32×32 square with a black 2px border, containing the pink titration mark centered. If the mark overflows or looks off-center, adjust `translate` / `scale` within the `<g>`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/public/mark-tile.svg
git commit -m "feat(web): add mark-tile.svg favicon with brutalist cream tile"
```

---

## Task 4: Wire favicon into index.html (remove old, add new)

**Files:**
- Modify: `packages/web/index.html`

- [ ] **Step 1: Replace the existing icon link**

In `packages/web/index.html`, find:

```html
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
```

Replace with:

```html
    <link rel="icon" type="image/svg+xml" href="/mark-tile.svg" />
```

- [ ] **Step 2: Verify the page still loads**

Run: `cd packages/web && yarn dev`
In a separate terminal: `curl -sS http://localhost:5173/mark-tile.svg | head -3`
Expected: SVG content returned, HTTP 200. Open the page in a browser — favicon should show the pink titration curve.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add packages/web/index.html
git commit -m "feat(web): swap favicon to mark-tile.svg"
```

---

## Task 5: Rewrite `packages/web/src/index.css` with the brand `@theme` layer

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Back up the current content**

Read the current `packages/web/src/index.css` (should be 9 lines). No further action — just verify you understand the existing rules before replacing.

- [ ] **Step 2: Replace the entire file**

Write `packages/web/src/index.css`:

```css
@import "tailwindcss";

/* ---- Brand tokens ---- */
@theme {
  /* Ink scale (operator surfaces) */
  --color-ink-950: #0b0d10;
  --color-ink-900: #12151a;
  --color-ink-800: #1f2328;
  --color-ink-700: #30363d;
  --color-ink-500: #7d8590;
  --color-ink-100: #e6edf3;

  /* Cream scale (brutalist light surfaces) */
  --color-cream-50: #fefce8;
  --color-cream-100: #faf7dd;
  --color-cream-200: #f5f0c2;
  --color-cream-700: #555555;
  --color-cream-900: #171717;

  /* Brand pink */
  --color-pink-400: #f06ba3;
  --color-pink-500: #d63384;
  --color-pink-600: #b02473;
  --color-pink-700: #8c1a5b;

  /* Semantic (operator only) */
  --color-ok: #3fb950;
  --color-warn: #d29922;
  --color-err: #f85149;
  --color-info: #58a6ff;

  /* Brutalist chips */
  --color-chip-yellow: #facc15;
  --color-chip-green: #86efac;
  --color-chip-pink: #fda4af;

  /* Font families */
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --font-serif: "IBM Plex Serif", ui-serif, Georgia, serif;

  /* Motion */
  --default-transition-duration: 150ms;
  --default-transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}

/* ---- Light/dark brutalist surface cascade ---- */
[data-theme="light"] {
  --bg-page: var(--color-cream-50);
  --bg-card: #ffffff;
  --fg-primary: var(--color-cream-900);
  --fg-muted: var(--color-cream-700);
  --edge: var(--color-cream-900);
  --shadow-color: var(--color-cream-900);
  --accent-inline: var(--color-pink-600);
  --mark-color: var(--color-pink-500);
}
[data-theme="dark"] {
  --bg-page: var(--color-ink-950);
  --bg-card: var(--color-ink-900);
  --fg-primary: var(--color-ink-100);
  --fg-muted: var(--color-ink-500);
  --edge: var(--color-ink-100);
  --shadow-color: var(--color-ink-100);
  --accent-inline: var(--color-pink-400);
  --mark-color: var(--color-pink-400);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg-page: var(--color-ink-950);
    --bg-card: var(--color-ink-900);
    --fg-primary: var(--color-ink-100);
    --fg-muted: var(--color-ink-500);
    --edge: var(--color-ink-100);
    --shadow-color: var(--color-ink-100);
    --accent-inline: var(--color-pink-400);
    --mark-color: var(--color-pink-400);
  }
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --bg-page: var(--color-cream-50);
    --bg-card: #ffffff;
    --fg-primary: var(--color-cream-900);
    --fg-muted: var(--color-cream-700);
    --edge: var(--color-cream-900);
    --shadow-color: var(--color-cream-900);
    --accent-inline: var(--color-pink-600);
    --mark-color: var(--color-pink-500);
  }
}

/* ---- Component mode cascade ---- */
[data-mode="brutalist"] {
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 2px;
  --radius-pill: 9999px;
  --shadow-sm: 2px 2px 0 var(--shadow-color);
  --shadow-md: 4px 4px 0 var(--shadow-color);
  --shadow-lg: 6px 6px 0 var(--shadow-color);
  --border-width: 2px;
  --border-heavy: 3px;
  --border-color: var(--edge);
}
[data-mode="operator"] {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-pill: 9999px;
  --shadow-sm: 0 1px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --border-width: 1px;
  --border-heavy: 1px;
  --border-color: var(--color-ink-700);
}

/* ---- Global reset / body ---- */
html, body { height: 100%; }
body {
  font-family: var(--font-sans);
  background: var(--bg-page, var(--color-cream-50));
  color: var(--fg-primary, var(--color-cream-900));
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* ---- Block caret (operator input cursor) ---- */
@keyframes caret-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.block-caret { animation: caret-blink 1s steps(2, end) infinite; }

/* ---- Reduced-motion overrides ---- */
@media (prefers-reduced-motion: reduce) {
  [data-motion="press-translate"] { transform: none !important; }
  [data-motion="modal-translate"] { transform: none !important; }
  [data-motion="toast-slide"] { transform: none !important; }
  [data-motion="skeleton-shimmer"] { animation: none !important; background-position: 50% 50% !important; }
  .block-caret { animation: none !important; opacity: 1 !important; }
}
```

- [ ] **Step 3: Verify CSS compiles**

Run: `cd packages/web && yarn build`
Expected: exit code 0. If Tailwind reports any unknown `@theme` or `@import` syntax errors, read Tailwind v4 docs for the installed version (`@tailwindcss/vite` ^4.1.0) and reconcile.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/index.css
git commit -m "feat(web): brand @theme tokens, mode and surface cascades, motion + reduced-motion rules"
```

---

## Task 6: Create `set-theme.ts` pre-hydration helper

**Files:**
- Create: `packages/web/src/theme/set-theme.ts`

- [ ] **Step 1: Write the helper**

Write `packages/web/src/theme/set-theme.ts`:

```ts
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
```

- [ ] **Step 2: Write the test**

Write `packages/web/src/theme/set-theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readStoredTheme, writeStoredTheme, detectInitialTheme, applyTheme } from "./set-theme";

describe("set-theme helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("readStoredTheme returns null when unset", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("writeStoredTheme + readStoredTheme round-trip", () => {
    writeStoredTheme("dark");
    expect(readStoredTheme()).toBe("dark");
    writeStoredTheme("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("readStoredTheme returns null for invalid values", () => {
    localStorage.setItem("titrate-theme", "blue");
    expect(readStoredTheme()).toBeNull();
  });

  it("detectInitialTheme prefers stored value over OS preference", () => {
    writeStoredTheme("light");
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    expect(detectInitialTheme()).toBe("light");
  });

  it("detectInitialTheme falls back to OS preference", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList);
    expect(detectInitialTheme()).toBe("dark");
  });

  it("applyTheme sets data-theme on documentElement", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd packages/web && npx vitest run src/theme/set-theme.test.ts`
Expected: 6/6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/theme/set-theme.ts packages/web/src/theme/set-theme.test.ts
git commit -m "feat(web): add pre-hydration theme setter with localStorage + OS-preference fallback"
```

---

## Task 7: Inline pre-hydration script in `index.html`

**Files:**
- Modify: `packages/web/index.html`

- [ ] **Step 1: Add inline script before React's script tag**

In `packages/web/index.html`, find the existing `<script type="module" src="/src/main.tsx"></script>` line. Insert an inline script just above it (inside `<body>`, before the React script):

```html
    <script>
      (function () {
        try {
          var stored = localStorage.getItem("titrate-theme");
          var theme = (stored === "light" || stored === "dark")
            ? stored
            : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          document.documentElement.dataset.theme = theme;
        } catch (e) { /* noop */ }
      })();
    </script>
```

- [ ] **Step 2: Update CSP to allow inline script**

Find the existing `<meta http-equiv="Content-Security-Policy"` line. The current CSP has `script-src 'self'`. The inline script above won't execute under that. Replace `script-src 'self'` with `script-src 'self' 'unsafe-inline'` in the same meta — **only** because this single inline block is necessary for FOUC prevention and contains no user data. If the repo has a stricter CSP policy elsewhere (e.g., a hash-based CSP build plugin), use that instead.

Exact replacement: find `script-src 'self';` in the CSP meta and replace with `script-src 'self' 'unsafe-inline';`.

- [ ] **Step 3: Run the web build and dev server to verify**

Run: `cd packages/web && yarn build` → exit 0 expected.
Run: `cd packages/web && yarn dev` in one terminal; visit `http://localhost:5173` in a browser.
Expected: no CSP violations in the console. `document.documentElement.dataset.theme` evaluates to `"light"` or `"dark"` before any React code runs. The page body background reflects the current theme (cream for light, ink-950 for dark).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add packages/web/index.html
git commit -m "feat(web): inline pre-hydration theme setter to prevent FOUC"
```

---

## Task 8: Create `useTheme` React hook

**Files:**
- Create: `packages/web/src/theme/useTheme.ts`

- [ ] **Step 1: Write the hook**

Write `packages/web/src/theme/useTheme.ts`:

```ts
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
```

- [ ] **Step 2: Write the test**

Write `packages/web/src/theme/useTheme.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  it("initial read reflects data-theme attribute", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("setTheme('dark') updates state, DOM, and storage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("titrate-theme")).toBe("dark");
  });

  it("toggle flips between light and dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd packages/web && npx vitest run src/theme/useTheme.test.tsx`
Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/theme/useTheme.ts packages/web/src/theme/useTheme.test.tsx
git commit -m "feat(web): add useTheme hook for light/dark toggle with OS-sync"
```

---

## Task 9: Create `useMode` React hook (+ `ModeProvider` context)

**Files:**
- Create: `packages/web/src/theme/useMode.tsx`

- [ ] **Step 1: Write the hook + provider**

Write `packages/web/src/theme/useMode.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";

export type Mode = "brutalist" | "operator";

const ModeContext = createContext<Mode>("brutalist");

/**
 * ModeProvider sets a data-mode attribute on a wrapper div AND publishes
 * the mode through React context so descendants can branch JSX without
 * walking the DOM. Components imported from `components/ui/` read the
 * context to pick their variant.
 */
export function ModeProvider({ mode, children, className }: {
  mode: Mode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-mode={mode} className={className}>
      <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>
    </div>
  );
}

export function useMode(): Mode {
  return useContext(ModeContext);
}
```

- [ ] **Step 2: Write the test**

Write `packages/web/src/theme/useMode.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider, useMode } from "./useMode";

function ModeReadout() {
  const mode = useMode();
  return <span data-testid="readout">{mode}</span>;
}

describe("ModeProvider + useMode", () => {
  it("defaults to brutalist when no provider", () => {
    render(<ModeReadout />);
    expect(screen.getByTestId("readout").textContent).toBe("brutalist");
  });

  it("propagates mode through context", () => {
    render(
      <ModeProvider mode="operator">
        <ModeReadout />
      </ModeProvider>
    );
    expect(screen.getByTestId("readout").textContent).toBe("operator");
  });

  it("applies data-mode attribute on wrapper", () => {
    const { container } = render(
      <ModeProvider mode="brutalist">
        <span>hi</span>
      </ModeProvider>
    );
    expect(container.firstChild).toHaveAttribute("data-mode", "brutalist");
  });

  it("nested provider overrides parent", () => {
    render(
      <ModeProvider mode="brutalist">
        <ModeProvider mode="operator">
          <ModeReadout />
        </ModeProvider>
      </ModeProvider>
    );
    expect(screen.getByTestId("readout").textContent).toBe("operator");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd packages/web && npx vitest run src/theme/useMode.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 4: Create barrel export**

Write `packages/web/src/theme/index.ts`:

```ts
export { type Theme, applyTheme, detectInitialTheme, readStoredTheme, writeStoredTheme } from "./set-theme";
export { useTheme } from "./useTheme";
export { type Mode, ModeProvider, useMode } from "./useMode";
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/theme/useMode.tsx packages/web/src/theme/useMode.test.tsx packages/web/src/theme/index.ts
git commit -m "feat(web): add useMode hook and ModeProvider context"
```

---

## Task 10: Create `Mark` component (inline SVG mark)

**Files:**
- Create: `packages/web/src/components/ui/Mark.tsx`
- Create: `packages/web/src/components/ui/Mark.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/src/components/ui/Mark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mark } from "./Mark";

describe("Mark", () => {
  it("renders an SVG with viewBox 170 150", () => {
    render(<Mark size={32} />);
    const svg = screen.getByRole("img", { name: /titrate/i });
    expect(svg.getAttribute("viewBox")).toBe("0 0 170 150");
  });

  it("applies the given size as width + height", () => {
    render(<Mark size={48} />);
    const svg = screen.getByRole("img", { name: /titrate/i });
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });

  it("inherits color via currentColor by default", () => {
    render(<Mark size={24} />);
    const path = screen.getByRole("img", { name: /titrate/i }).querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("currentColor");
  });

  it("accepts a color prop to override currentColor", () => {
    render(<Mark size={24} color="#d63384" />);
    const path = screen.getByRole("img", { name: /titrate/i }).querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("#d63384");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/components/ui/Mark.test.tsx`
Expected: FAIL — "Cannot find module './Mark'".

- [ ] **Step 3: Implement the component**

Write `packages/web/src/components/ui/Mark.tsx`:

```tsx
/**
 * Titrate brand mark — angular `_/` titration curve with a hollow
 * equivalence-point circle at the inflection. Uses currentColor by
 * default so parents can theme via CSS; pass `color` to override.
 */
export function Mark({ size, color }: { size: number; color?: string }) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 170 150"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="titrate"
    >
      <path
        d="M 14 120 L 65 120 L 95 30 L 156 30"
        stroke={stroke}
        strokeWidth={12}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx={80} cy={75} r={22} stroke={stroke} strokeWidth={8} />
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && npx vitest run src/components/ui/Mark.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Mark.tsx packages/web/src/components/ui/Mark.test.tsx
git commit -m "feat(web/ui): add Mark component (inline titration-curve SVG)"
```

---

## Task 11: Create `Wordmark` component

**Files:**
- Create: `packages/web/src/components/ui/Wordmark.tsx`
- Create: `packages/web/src/components/ui/Wordmark.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/src/components/ui/Wordmark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the mark and 'titrate' text side-by-side", () => {
    render(<Wordmark size="nav" />);
    expect(screen.getByRole("img", { name: /titrate/i })).toBeInTheDocument();
    expect(screen.getByText("titrate")).toBeInTheDocument();
  });

  it("'nav' size uses small mark + ~22px text", () => {
    render(<Wordmark size="nav" />);
    const svg = screen.getByRole("img", { name: /titrate/i });
    expect(svg.getAttribute("width")).toBe("32");
  });

  it("'hero' size uses large mark", () => {
    render(<Wordmark size="hero" />);
    const svg = screen.getByRole("img", { name: /titrate/i });
    expect(svg.getAttribute("width")).toBe("150");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd packages/web && npx vitest run src/components/ui/Wordmark.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Wordmark.tsx`:

```tsx
import { Mark } from "./Mark";

const SIZES = {
  nav: { mark: 32, text: "text-[22px]" },
  hero: { mark: 150, text: "text-5xl" },
} as const;

export function Wordmark({ size }: { size: "nav" | "hero" }) {
  const { mark, text } = SIZES[size];
  return (
    <span
      className={`inline-flex items-center gap-3 text-[color:var(--mark-color)]`}
    >
      <Mark size={mark} />
      <span className={`${text} font-sans font-extrabold tracking-[-0.02em] text-[color:var(--fg-primary)]`}>
        titrate
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Run tests to pass**

Run: `cd packages/web && npx vitest run src/components/ui/Wordmark.test.tsx`
Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Wordmark.tsx packages/web/src/components/ui/Wordmark.test.tsx
git commit -m "feat(web/ui): add Wordmark component (Mark + titrate text)"
```

---

## Task 12: Create `Button` component

**Files:**
- Create: `packages/web/src/components/ui/Button.tsx`
- Create: `packages/web/src/components/ui/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/src/components/ui/Button.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Button } from "./Button";

describe("Button", () => {
  it("renders as a button with the label", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });

  it("brutalist primary: pink-600 bg, 2px border, offset shadow classes", () => {
    render(
      <ModeProvider mode="brutalist">
        <Button variant="primary">Launch</Button>
      </ModeProvider>
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[color:var(--color-pink-600)]");
    expect(btn.className).toContain("border-2");
    expect(btn.className).toContain("shadow-[3px_3px_0_var(--shadow-color)]");
  });

  it("operator primary: pink-600 bg, rounded-md, no border", () => {
    render(
      <ModeProvider mode="operator">
        <Button variant="primary">Save</Button>
      </ModeProvider>
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[color:var(--color-pink-600)]");
    expect(btn.className).toContain("rounded-md");
  });

  it("forwards onClick", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Go</Button>);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("renders small size with reduced padding", () => {
    render(<Button size="sm">Tiny</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-xs");
  });

  it("disabled buttons block clicks and drop opacity", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    let clicked = false;
    render(<Button disabled onClick={() => { clicked = true; }}>No</Button>);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(clicked).toBe(false);
    expect(screen.getByRole("button").className).toContain("opacity-");
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd packages/web && npx vitest run src/components/ui/Button.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement Button**

Write `packages/web/src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useMode } from "../../theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const SIZE_OPERATOR: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1",
  md: "text-sm px-3.5 py-1.5",
  lg: "text-sm px-4 py-2.5",
};

const SIZE_BRUTALIST: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1 shadow-[2px_2px_0_var(--shadow-color)]",
  md: "text-sm px-4.5 py-2.5 shadow-[3px_3px_0_var(--shadow-color)]",
  lg: "text-base px-5 py-3 shadow-[3px_3px_0_var(--shadow-color)]",
};

const VARIANT_OPERATOR: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--color-pink-600)] text-white hover:bg-[color:var(--color-pink-700)]",
  secondary: "bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] hover:bg-[color:var(--color-ink-700)] hover:border-[color:var(--color-ink-500)]",
  ghost: "bg-transparent text-[color:var(--color-ink-100)] hover:bg-[color:var(--color-ink-800)]",
  danger: "bg-transparent text-[color:var(--color-err)] border border-[color:var(--color-ink-700)] hover:bg-[color:var(--color-err)]/10 hover:border-[color:var(--color-err)]",
};

const VARIANT_BRUTALIST: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--color-pink-600)] text-white border-2 border-[color:var(--edge)] hover:bg-[color:var(--color-pink-700)]",
  secondary: "bg-[color:var(--color-cream-100)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  ghost: "bg-[color:var(--bg-page)] text-[color:var(--fg-primary)] border-2 border-[color:var(--edge)]",
  danger: "bg-[color:var(--color-chip-pink)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
};

const BRUTALIST_PRESS = "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--shadow-color)]";

export function Button({
  variant = "secondary",
  size = "md",
  disabled,
  children,
  ...rest
}: Props) {
  const mode = useMode();
  const base = "inline-flex items-center justify-center font-sans font-semibold leading-tight transition-[background-color,transform,box-shadow] duration-[80ms] focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]";
  const motion = mode === "brutalist" ? BRUTALIST_PRESS : "";
  const shape = mode === "brutalist" ? "rounded-none" : "rounded-md";
  const sizeClass = mode === "brutalist" ? SIZE_BRUTALIST[size] : SIZE_OPERATOR[size];
  const variantClass = mode === "brutalist" ? VARIANT_BRUTALIST[variant] : VARIANT_OPERATOR[variant];
  const disabledClass = disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer";
  return (
    <button
      type="button"
      disabled={disabled}
      data-motion={mode === "brutalist" ? "press-translate" : undefined}
      className={`${base} ${shape} ${sizeClass} ${variantClass} ${motion} ${disabledClass}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/web && npx vitest run src/components/ui/Button.test.tsx`
Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Button.tsx packages/web/src/components/ui/Button.test.tsx
git commit -m "feat(web/ui): add Button (4 variants x 2 modes x 3 sizes)"
```

---

## Task 13: Create `BlockCaret` component (blinking operator-input cursor)

**Files:**
- Create: `packages/web/src/components/ui/BlockCaret.tsx`
- Create: `packages/web/src/components/ui/BlockCaret.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/BlockCaret.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockCaret } from "./BlockCaret";

describe("BlockCaret", () => {
  it("renders a span with the block-caret class", () => {
    render(<BlockCaret />);
    const caret = screen.getByTestId("block-caret");
    expect(caret.className).toContain("block-caret");
  });

  it("uses pink-500 as background", () => {
    render(<BlockCaret />);
    const caret = screen.getByTestId("block-caret");
    expect(caret.getAttribute("style")).toContain("d63384");
  });

  it("is hidden from screen readers", () => {
    render(<BlockCaret />);
    expect(screen.getByTestId("block-caret").getAttribute("aria-hidden")).toBe("true");
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd packages/web && npx vitest run src/components/ui/BlockCaret.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/BlockCaret.tsx`:

```tsx
/**
 * Blinking pink block caret for operator-A inputs. Paired with
 * `caret-color: transparent` on the input element so the native
 * thin caret is hidden and this block renders in its place.
 * Blink animation (CSS class `block-caret`) is defined in index.css
 * and frozen to solid under prefers-reduced-motion.
 */
export function BlockCaret() {
  return (
    <span
      data-testid="block-caret"
      aria-hidden="true"
      className="block-caret inline-block align-middle"
      style={{
        width: "0.6ch",
        height: "1em",
        background: "#d63384",
        marginLeft: "1px",
      }}
    />
  );
}
```

- [ ] **Step 4: Run to pass**

Run: `cd packages/web && npx vitest run src/components/ui/BlockCaret.test.tsx` — 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/BlockCaret.tsx packages/web/src/components/ui/BlockCaret.test.tsx
git commit -m "feat(web/ui): add BlockCaret (blinking pink block for operator inputs)"
```

---

## Task 14: Create `Input` component

**Files:**
- Create: `packages/web/src/components/ui/Input.tsx`
- Create: `packages/web/src/components/ui/Input.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Input.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Input } from "./Input";

describe("Input", () => {
  it("renders an input element with label", () => {
    render(<Input label="Campaign name" />);
    expect(screen.getByLabelText("Campaign name")).toBeInTheDocument();
  });

  it("brutalist: 2px border, offset shadow, 0 radius", () => {
    render(
      <ModeProvider mode="brutalist">
        <Input label="Address" />
      </ModeProvider>
    );
    const input = screen.getByLabelText("Address");
    expect(input.className).toContain("border-2");
    expect(input.className).toContain("rounded-none");
    expect(input.className).toContain("shadow-[3px_3px_0_var(--shadow-color)]");
  });

  it("operator: 1px border, ink-900 bg, 6px radius", () => {
    render(
      <ModeProvider mode="operator">
        <Input label="Address" />
      </ModeProvider>
    );
    const input = screen.getByLabelText("Address");
    expect(input.className).toContain("bg-[color:var(--color-ink-900)]");
    expect(input.className).toContain("rounded-md");
  });

  it("accepts value + onChange", () => {
    let value = "";
    const { rerender } = render(
      <Input label="X" value={value} onChange={(e) => { value = e.target.value; }} />
    );
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "hex-airdrop" } });
    expect(value).toBe("hex-airdrop");
    rerender(<Input label="X" value={value} onChange={() => {}} />);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd packages/web && npx vitest run src/components/ui/Input.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Input.tsx`:

```tsx
import { useId, type InputHTMLAttributes } from "react";
import { useMode } from "../../theme";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, id, ...rest }: Props) {
  const mode = useMode();
  const reactId = useId();
  const inputId = id ?? reactId;

  const labelClass = mode === "brutalist"
    ? "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2"
    : "block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5";

  const inputBase = "w-full font-sans text-sm leading-tight outline-none transition-[box-shadow,border-color] duration-[80ms]";

  const inputBrutalist = "rounded-none bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] shadow-[3px_3px_0_var(--shadow-color)] px-3 py-2 font-mono focus:border-[color:var(--color-pink-500)] focus:shadow-[3px_3px_0_var(--color-pink-500)] placeholder:text-[color:var(--color-cream-700)]";

  const inputOperator = "rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] px-3 py-1.5 focus:shadow-[0_0_0_3px_var(--color-pink-500)] placeholder:text-[color:var(--color-ink-500)] caret-[color:var(--color-pink-500)]";

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <input
        id={inputId}
        className={`${inputBase} ${mode === "brutalist" ? inputBrutalist : inputOperator}`}
        {...rest}
      />
      {hint ? (
        <p className={`mt-1 text-xs ${mode === "brutalist" ? "text-[color:var(--color-cream-700)] font-mono" : "text-[color:var(--color-ink-500)]"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to pass**

Run: `cd packages/web && npx vitest run src/components/ui/Input.test.tsx` — 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Input.tsx packages/web/src/components/ui/Input.test.tsx
git commit -m "feat(web/ui): add Input (brutalist + operator variants, pink focus ring)"
```

---

## Task 15: Create `Textarea` component

**Files:**
- Create: `packages/web/src/components/ui/Textarea.tsx`
- Create: `packages/web/src/components/ui/Textarea.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Textarea.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("renders with label and rows", () => {
    render(<Textarea label="Notes" rows={4} />);
    const ta = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.rows).toBe(4);
  });

  it("brutalist styling applies", () => {
    render(<ModeProvider mode="brutalist"><Textarea label="X" /></ModeProvider>);
    expect(screen.getByLabelText("X").className).toContain("border-2");
  });

  it("operator styling applies", () => {
    render(<ModeProvider mode="operator"><Textarea label="X" /></ModeProvider>);
    expect(screen.getByLabelText("X").className).toContain("bg-[color:var(--color-ink-900)]");
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd packages/web && npx vitest run src/components/ui/Textarea.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Textarea.tsx`:

```tsx
import { useId, type TextareaHTMLAttributes } from "react";
import { useMode } from "../../theme";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  label: string;
};

export function Textarea({ label, id, rows = 3, ...rest }: Props) {
  const mode = useMode();
  const reactId = useId();
  const taId = id ?? reactId;

  const labelClass = mode === "brutalist"
    ? "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2"
    : "block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5";

  const base = "w-full font-sans text-sm leading-relaxed outline-none transition-[box-shadow,border-color] duration-[80ms] resize-vertical";

  const brut = "rounded-none bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] shadow-[3px_3px_0_var(--shadow-color)] px-3 py-2 font-mono focus:border-[color:var(--color-pink-500)] focus:shadow-[3px_3px_0_var(--color-pink-500)]";

  const op = "rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] px-3 py-2 focus:shadow-[0_0_0_3px_var(--color-pink-500)] caret-[color:var(--color-pink-500)]";

  return (
    <div>
      <label htmlFor={taId} className={labelClass}>{label}</label>
      <textarea
        id={taId}
        rows={rows}
        className={`${base} ${mode === "brutalist" ? brut : op}`}
        {...rest}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to pass**

Run: `cd packages/web && npx vitest run src/components/ui/Textarea.test.tsx` — 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Textarea.tsx packages/web/src/components/ui/Textarea.test.tsx
git commit -m "feat(web/ui): add Textarea (brutalist + operator variants)"
```

---

## Task 16: Create `Select` component

**Files:**
- Create: `packages/web/src/components/ui/Select.tsx`
- Create: `packages/web/src/components/ui/Select.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Select.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "./Select";

describe("Select", () => {
  it("renders a native select with options", () => {
    render(
      <Select label="Chain" options={[
        { value: "ethereum", label: "Ethereum" },
        { value: "arbitrum", label: "Arbitrum" },
      ]} />
    );
    const sel = screen.getByLabelText("Chain") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect(sel.options.length).toBe(2);
  });

  it("onChange fires with selected value", () => {
    let chosen = "";
    render(
      <Select label="Chain" options={[
        { value: "ethereum", label: "Ethereum" },
        { value: "arbitrum", label: "Arbitrum" },
      ]} onChange={(e) => { chosen = e.target.value; }} />
    );
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "arbitrum" } });
    expect(chosen).toBe("arbitrum");
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/components/ui/Select.test.tsx`.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Select.tsx`:

```tsx
import { useId, type SelectHTMLAttributes } from "react";
import { useMode } from "../../theme";

type Option = { value: string; label: string };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
  label: string;
  options: Option[];
};

export function Select({ label, options, id, ...rest }: Props) {
  const mode = useMode();
  const reactId = useId();
  const selId = id ?? reactId;

  const labelClass = mode === "brutalist"
    ? "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2"
    : "block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5";

  const base = "w-full font-sans text-sm leading-tight outline-none transition-[box-shadow,border-color] duration-[80ms] cursor-pointer";

  const brut = "rounded-none bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] shadow-[3px_3px_0_var(--shadow-color)] px-3 py-2 font-mono focus:border-[color:var(--color-pink-500)] focus:shadow-[3px_3px_0_var(--color-pink-500)]";

  const op = "rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] px-3 py-1.5 focus:shadow-[0_0_0_3px_var(--color-pink-500)]";

  return (
    <div>
      <label htmlFor={selId} className={labelClass}>{label}</label>
      <select
        id={selId}
        className={`${base} ${mode === "brutalist" ? brut : op}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Run to pass** — 2/2.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Select.tsx packages/web/src/components/ui/Select.test.tsx
git commit -m "feat(web/ui): add Select (native element styled for brutalist + operator)"
```

---

## Task 17: Create `Checkbox` component

**Files:**
- Create: `packages/web/src/components/ui/Checkbox.tsx`
- Create: `packages/web/src/components/ui/Checkbox.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Checkbox.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders a checkbox with label", () => {
    render(<Checkbox label="Use existing wallets" />);
    expect(screen.getByRole("checkbox", { name: "Use existing wallets" })).toBeInTheDocument();
  });

  it("reflects checked state", () => {
    render(<Checkbox label="x" checked readOnly />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("uses pink-500 accent color", () => {
    render(<Checkbox label="x" />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).style.accentColor).toContain("d63384");
  });
});
```

- [ ] **Step 2: Run to fail**. `npx vitest run src/components/ui/Checkbox.test.tsx`.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Checkbox.tsx`:

```tsx
import { useId, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: string;
};

export function Checkbox({ label, id, ...rest }: Props) {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <label htmlFor={inputId} className="inline-flex items-center gap-2 font-sans text-sm text-[color:var(--fg-primary)] cursor-pointer select-none">
      <input
        id={inputId}
        type="checkbox"
        style={{ accentColor: "#d63384" }}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
```

- [ ] **Step 4: Run to pass** — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Checkbox.tsx packages/web/src/components/ui/Checkbox.test.tsx
git commit -m "feat(web/ui): add Checkbox with pink-500 accent"
```

---

## Task 18: Create `Pill` component (status pills for both modes)

**Files:**
- Create: `packages/web/src/components/ui/Pill.tsx`
- Create: `packages/web/src/components/ui/Pill.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Pill.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders text", () => {
    render(<Pill tone="ok">running</Pill>);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("operator ok pill uses semantic ok color family", () => {
    render(<ModeProvider mode="operator"><Pill tone="ok">running</Pill></ModeProvider>);
    const el = screen.getByText("running").closest("span");
    expect(el?.className).toContain("text-[color:var(--color-ok)]");
  });

  it("brutalist ok pill uses chip-green background", () => {
    render(<ModeProvider mode="brutalist"><Pill tone="ok">running</Pill></ModeProvider>);
    const el = screen.getByText("running").closest("span");
    expect(el?.className).toContain("bg-[color:var(--color-chip-green)]");
  });

  it("shows leading dot when dot prop is true", () => {
    render(<Pill tone="ok" dot>live</Pill>);
    expect(screen.getByTestId("pill-dot")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Pill.tsx`:

```tsx
import type { ReactNode } from "react";
import { useMode } from "../../theme";

export type PillTone = "ok" | "warn" | "err" | "info" | "neutral";

const OP_TONE: Record<PillTone, string> = {
  ok: "bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)] border border-[color:var(--color-ok)]/30",
  warn: "bg-[color:var(--color-warn)]/10 text-[color:var(--color-warn)] border border-[color:var(--color-warn)]/30",
  err: "bg-[color:var(--color-err)]/10 text-[color:var(--color-err)] border border-[color:var(--color-err)]/30",
  info: "bg-[color:var(--color-info)]/10 text-[color:var(--color-info)] border border-[color:var(--color-info)]/30",
  neutral: "bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)]",
};

const BRUT_TONE: Record<PillTone, string> = {
  ok: "bg-[color:var(--color-chip-green)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  warn: "bg-[color:var(--color-chip-yellow)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  err: "bg-[color:var(--color-chip-pink)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  info: "bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  neutral: "bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
};

export function Pill({ tone, dot, children }: { tone: PillTone; dot?: boolean; children: ReactNode }) {
  const mode = useMode();
  const base = mode === "brutalist"
    ? "inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] px-2 py-0.5"
    : "inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded-full";
  const toneClass = mode === "brutalist" ? BRUT_TONE[tone] : OP_TONE[tone];
  return (
    <span className={`${base} ${toneClass}`}>
      {dot ? <span data-testid="pill-dot" className="w-1.5 h-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run to pass** — 4/4.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Pill.tsx packages/web/src/components/ui/Pill.test.tsx
git commit -m "feat(web/ui): add Pill (semantic operator pills + brutalist chip-backed pills)"
```

---

## Task 19: Create `Chip` component (brutalist verb chips)

**Files:**
- Create: `packages/web/src/components/ui/Chip.tsx`
- Create: `packages/web/src/components/ui/Chip.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Chip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders the label", () => {
    render(<Chip color="yellow">Sign cold</Chip>);
    expect(screen.getByText("Sign cold")).toBeInTheDocument();
  });

  it("yellow chip uses chip-yellow background", () => {
    render(<Chip color="yellow">x</Chip>);
    expect(screen.getByText("x").className).toContain("bg-[color:var(--color-chip-yellow)]");
  });

  it("green chip uses chip-green", () => {
    render(<Chip color="green">x</Chip>);
    expect(screen.getByText("x").className).toContain("bg-[color:var(--color-chip-green)]");
  });

  it("pink chip uses chip-pink", () => {
    render(<Chip color="pink">x</Chip>);
    expect(screen.getByText("x").className).toContain("bg-[color:var(--color-chip-pink)]");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Chip.tsx`:

```tsx
import type { ReactNode } from "react";

const BG: Record<"yellow" | "green" | "pink", string> = {
  yellow: "bg-[color:var(--color-chip-yellow)]",
  green: "bg-[color:var(--color-chip-green)]",
  pink: "bg-[color:var(--color-chip-pink)]",
};

export function Chip({ color, children }: { color: "yellow" | "green" | "pink"; children: ReactNode }) {
  return (
    <span
      className={`inline-block font-mono text-xs font-bold uppercase tracking-[0.1em] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] px-3 py-1.5 ${BG[color]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run to pass** — 4/4.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Chip.tsx packages/web/src/components/ui/Chip.test.tsx
git commit -m "feat(web/ui): add Chip (brutalist verb chips: yellow/green/pink)"
```

---

## Task 20: Create `Card` component

**Files:**
- Create: `packages/web/src/components/ui/Card.tsx`
- Create: `packages/web/src/components/ui/Card.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/Card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>inner</Card>);
    expect(screen.getByText("inner")).toBeInTheDocument();
  });

  it("brutalist: 2px border, offset shadow, 0 radius", () => {
    render(<ModeProvider mode="brutalist"><Card data-testid="c">x</Card></ModeProvider>);
    expect(screen.getByTestId("c").className).toContain("border-2");
    expect(screen.getByTestId("c").className).toContain("shadow-[4px_4px_0_var(--shadow-color)]");
    expect(screen.getByTestId("c").className).toContain("rounded-none");
  });

  it("operator: 1px border, 8px radius, no offset shadow", () => {
    render(<ModeProvider mode="operator"><Card data-testid="c">x</Card></ModeProvider>);
    expect(screen.getByTestId("c").className).toContain("rounded-lg");
    expect(screen.getByTestId("c").className).toContain("border");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/Card.tsx`:

```tsx
import type { ReactNode, HTMLAttributes } from "react";
import { useMode } from "../../theme";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function Card({ children, className = "", ...rest }: Props) {
  const mode = useMode();
  const base = "p-4";
  const brut = "bg-[color:var(--bg-card)] text-[color:var(--fg-primary)] border-2 border-[color:var(--edge)] rounded-none shadow-[4px_4px_0_var(--shadow-color)]";
  const op = "bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-800)] rounded-lg";
  return (
    <div className={`${base} ${mode === "brutalist" ? brut : op} ${className}`} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run to pass** — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/Card.tsx packages/web/src/components/ui/Card.test.tsx
git commit -m "feat(web/ui): add Card (brutalist hero/summary + operator entity variants)"
```

---

## Task 21: Create `StatCard` component (brutalist-only, big number + label)

**Files:**
- Create: `packages/web/src/components/ui/StatCard.tsx`
- Create: `packages/web/src/components/ui/StatCard.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/StatCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and sub text", () => {
    render(<StatCard label="Batches" value="42" sub="40 included · 1 reverted · 1 pending" />);
    expect(screen.getByText("Batches")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/40 included/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/StatCard.tsx`:

```tsx
import { Card } from "./Card";

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)]">{label}</p>
      <p className="font-sans text-3xl font-extrabold tracking-tight text-[color:var(--fg-primary)] mt-1">{value}</p>
      {sub ? <p className="font-mono text-xs text-[color:var(--color-cream-700)] mt-1">{sub}</p> : null}
    </Card>
  );
}
```

- [ ] **Step 4: Run to pass** — 1/1.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/StatCard.tsx packages/web/src/components/ui/StatCard.test.tsx
git commit -m "feat(web/ui): add StatCard for brutalist summary sections"
```

---

## Task 22: Create `DataTable` component

**Files:**
- Create: `packages/web/src/components/ui/DataTable.tsx`
- Create: `packages/web/src/components/ui/DataTable.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/DataTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "./DataTable";

type Row = { id: number; name: string; status: string };

describe("DataTable", () => {
  const columns = [
    { key: "id" as const, header: "#" },
    { key: "name" as const, header: "Name" },
    { key: "status" as const, header: "Status" },
  ];
  const rows: Row[] = [
    { id: 1, name: "alice", status: "running" },
    { id: 2, name: "bob", status: "paused" },
  ];

  it("renders header cells", () => {
    render(<DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders body rows", () => {
    render(<DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("brutalist mode applies outer 2px border", () => {
    render(<DataTable<Row> mode="brutalist" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");
    expect(table.className).toContain("border-2");
  });

  it("operator mode applies no outer border", () => {
    render(<DataTable<Row> mode="operator" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");
    expect(table.className).not.toContain("border-2");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/DataTable.tsx`:

```tsx
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: keyof T;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  mode?: "operator" | "brutalist";
};

export function DataTable<T>({ columns, rows, rowKey, mode = "operator" }: Props<T>) {
  if (mode === "brutalist") {
    return (
      <table className="w-full border-collapse border-2 border-[color:var(--edge)] bg-white shadow-[4px_4px_0_var(--shadow-color)]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className="bg-[color:var(--color-cream-900)] text-[color:var(--color-cream-50)] font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-left px-3 py-2.5"
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r)} className={i % 2 === 1 ? "bg-[color:var(--color-cream-100)]" : ""}>
              {columns.map((c) => (
                <td key={String(c.key)} className="font-mono text-[13px] text-[color:var(--color-cream-900)] px-3 py-2 border-b border-[color:var(--edge)]">
                  {c.render ? c.render(r) : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={String(c.key)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-ink-500)] text-left px-3 py-2 border-b border-[color:var(--color-ink-800)] font-medium"
              style={c.width ? { width: c.width } : undefined}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} className="hover:bg-[color:var(--color-ink-800)]/20">
            {columns.map((c) => (
              <td key={String(c.key)} className="font-mono text-xs text-[color:var(--color-ink-100)] px-3 py-1.5">
                {c.render ? c.render(r) : String(r[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run to pass** — 4/4.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/DataTable.tsx packages/web/src/components/ui/DataTable.test.tsx
git commit -m "feat(web/ui): add DataTable (dense operator default + bordered brutalist variant)"
```

---

## Task 23: Create `OperatorPanel` wrapper

**Files:**
- Create: `packages/web/src/components/ui/OperatorPanel.tsx`
- Create: `packages/web/src/components/ui/OperatorPanel.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/OperatorPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorPanel } from "./OperatorPanel";

describe("OperatorPanel", () => {
  it("renders children inside a dark ink panel", () => {
    render(<OperatorPanel data-testid="p">inside</OperatorPanel>);
    const p = screen.getByTestId("p");
    expect(p.className).toContain("bg-[color:var(--color-ink-950)]");
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("applies data-mode=operator on the panel", () => {
    render(<OperatorPanel data-testid="p">x</OperatorPanel>);
    expect(screen.getByTestId("p").getAttribute("data-mode")).toBe("operator");
  });

  it("renders an outer cream/ink frame via 2px border + offset shadow", () => {
    render(<OperatorPanel data-testid="p">x</OperatorPanel>);
    expect(screen.getByTestId("p").className).toContain("border-2");
    expect(screen.getByTestId("p").className).toContain("shadow-[4px_4px_0_var(--shadow-color)]");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/OperatorPanel.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { ModeProvider } from "../../theme";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

/**
 * A dark operator-A surface embedded in a brutalist chassis.
 * Publishes data-mode="operator" and a React context so descendants
 * render in operator-A styling even though the surrounding page is
 * brutalist. The 2px outer border + 4px offset shadow adopt the
 * current brutalist surface (cream-900 on light, ink-100 on dark)
 * so the panel reads as framed by the workbench.
 */
export function OperatorPanel({ children, className = "", ...rest }: Props) {
  return (
    <ModeProvider mode="operator" className={`bg-[color:var(--color-ink-950)] text-[color:var(--color-ink-100)] border-2 border-[color:var(--edge)] shadow-[4px_4px_0_var(--shadow-color)] p-4 ${className}`}>
      {children}
    </ModeProvider>
  );
}
```

Note: `ModeProvider` already wraps in a `<div data-mode={mode}>`. For `OperatorPanel.test.tsx` to spread other props onto that div, update `ModeProvider` to forward extra HTML attributes. **Open the `useMode.tsx` file and change the signature** to accept `...rest: HTMLAttributes<HTMLDivElement>`:

```tsx
// In packages/web/src/theme/useMode.tsx — replace ModeProvider with:
export function ModeProvider({ mode, children, className, ...rest }: {
  mode: Mode;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div data-mode={mode} className={className} {...rest}>
      <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>
    </div>
  );
}
```

Add `import type { HTMLAttributes } from "react";` at the top if not already present. Re-run `useMode.test.tsx` — 4/4 must still pass.

- [ ] **Step 4: Run OperatorPanel tests**

Run: `cd packages/web && npx vitest run src/components/ui/OperatorPanel.test.tsx src/theme/useMode.test.tsx`
Expected: 3/3 + 4/4 = 7 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/OperatorPanel.tsx packages/web/src/components/ui/OperatorPanel.test.tsx packages/web/src/theme/useMode.tsx
git commit -m "feat(web/ui): add OperatorPanel wrapper + forward extra props through ModeProvider"
```

---

## Task 24: Create `ThemeToggle` component

**Files:**
- Create: `packages/web/src/components/ui/ThemeToggle.tsx`
- Create: `packages/web/src/components/ui/ThemeToggle.test.tsx`

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  it("renders a button with accessible label", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  it("clicking flips data-theme and persists", async () => {
    render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole("button", { name: /theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("titrate-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/ThemeToggle.tsx`:

```tsx
import { useTheme } from "../../theme";
import { Button } from "./Button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const glyph = theme === "dark" ? "◐" : "◑";
  return (
    <Button aria-label={label} onClick={toggle} variant="ghost" size="sm">
      <span aria-hidden className="font-mono">{glyph}</span>
    </Button>
  );
}
```

- [ ] **Step 4: Run to pass**. If `@testing-library/user-event` isn't installed, run `yarn add -D -W @testing-library/user-event@^14` then retry.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/ThemeToggle.tsx packages/web/src/components/ui/ThemeToggle.test.tsx
git commit -m "feat(web/ui): add ThemeToggle button bound to useTheme"
```

---

## Task 25: Create `AppShell` component (top-level brutalist chrome)

**Files:**
- Create: `packages/web/src/components/ui/AppShell.tsx`
- Create: `packages/web/src/components/ui/AppShell.test.tsx`

Note: there is an existing `packages/web/src/components/AppShell.tsx` which is a page-level concern with its own responsibilities. The new `components/ui/AppShell.tsx` is the brand-shell primitive. They coexist until the existing one is migrated (out of scope for this plan).

- [ ] **Step 1: Write the test**

Write `packages/web/src/components/ui/AppShell.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders nav with Mark + wordmark", () => {
    render(
      <AppShell
        nav={[{ label: "Campaigns", href: "/" }]}
        activeHref="/"
      >
        <p>page content</p>
      </AppShell>
    );
    expect(screen.getByRole("img", { name: /titrate/i })).toBeInTheDocument();
    expect(screen.getByText("titrate")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("marks the active nav item", () => {
    render(
      <AppShell
        nav={[{ label: "Campaigns", href: "/c" }, { label: "Wallets", href: "/w" }]}
        activeHref="/w"
      >
        <p>x</p>
      </AppShell>
    );
    expect(screen.getByText("Wallets").className).toContain("border-b-[3px]");
    expect(screen.getByText("Campaigns").className).not.toContain("border-b-[3px]");
  });

  it("wraps content in data-mode=brutalist", () => {
    render(
      <AppShell nav={[]} activeHref="">
        <p data-testid="content">x</p>
      </AppShell>
    );
    const wrapper = screen.getByTestId("content").closest("[data-mode]");
    expect(wrapper?.getAttribute("data-mode")).toBe("brutalist");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/web/src/components/ui/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { ModeProvider } from "../../theme";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { label: string; href: string };

type Props = {
  nav: NavItem[];
  activeHref: string;
  children: ReactNode;
  right?: ReactNode;
};

export function AppShell({ nav, activeHref, children, right }: Props) {
  return (
    <ModeProvider mode="brutalist" className="min-h-screen bg-[color:var(--bg-page)] text-[color:var(--fg-primary)]">
      <nav className="flex items-center gap-5 px-5 py-4 border-b-2 border-[color:var(--edge)]">
        <Wordmark size="nav" />
        <div className="flex items-center gap-4 ml-4">
          {nav.map((item) => {
            const active = item.href === activeHref;
            const base = "font-mono text-xs font-bold uppercase tracking-[0.12em] pb-1 cursor-pointer";
            const activeCls = active ? "border-b-[3px] border-[color:var(--color-pink-500)]" : "";
            return (
              <a key={item.href} href={item.href} className={`${base} ${activeCls}`}>
                {item.label}
              </a>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <ThemeToggle />
        </div>
      </nav>
      <main className="px-5 py-6">{children}</main>
    </ModeProvider>
  );
}
```

- [ ] **Step 4: Run to pass** — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/AppShell.tsx packages/web/src/components/ui/AppShell.test.tsx
git commit -m "feat(web/ui): add AppShell brutalist chrome with nav and ThemeToggle"
```

---

## Task 26: Barrel export and public API

**Files:**
- Create: `packages/web/src/components/ui/index.ts`

- [ ] **Step 1: Write barrel**

Write `packages/web/src/components/ui/index.ts`:

```ts
export { Mark } from "./Mark";
export { Wordmark } from "./Wordmark";
export { Button, type ButtonVariant, type ButtonSize } from "./Button";
export { BlockCaret } from "./BlockCaret";
export { Input } from "./Input";
export { Textarea } from "./Textarea";
export { Select } from "./Select";
export { Checkbox } from "./Checkbox";
export { Pill, type PillTone } from "./Pill";
export { Chip } from "./Chip";
export { Card } from "./Card";
export { StatCard } from "./StatCard";
export { DataTable, type DataTableColumn } from "./DataTable";
export { OperatorPanel } from "./OperatorPanel";
export { AppShell } from "./AppShell";
export { ThemeToggle } from "./ThemeToggle";
```

- [ ] **Step 2: Verify all components resolve**

Run: `cd packages/web && npx tsc --noEmit`
Expected: exit code 0. If errors surface (unused imports, missing types), fix them inline. Once green, run the whole component-library test suite:

Run: `cd packages/web && npx vitest run src/components/ui`
Expected: all tests across all `ui/*.test.tsx` files pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ui/index.ts
git commit -m "feat(web/ui): barrel export for the brand primitive library"
```

---

## Task 27: Create TUI `theme/colors.ts` ANSI-256 color map

**Files:**
- Create: `packages/tui/src/theme/colors.ts`
- Create: `packages/tui/src/theme/colors.test.ts`

- [ ] **Step 1: Write the test**

Write `packages/tui/src/theme/colors.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { colors } from "./colors";

describe("TUI colors", () => {
  it("exports ink scale", () => {
    expect(colors.ink.n950).toBe(232);
    expect(colors.ink.n100).toBe(252);
  });

  it("exports pink scale", () => {
    expect(colors.pink.n400).toBe(205);
    expect(colors.pink.n500).toBe(169);
  });

  it("exports semantic colors", () => {
    expect(colors.ok).toBe(71);
    expect(colors.warn).toBe(178);
    expect(colors.err).toBe(203);
    expect(colors.info).toBe(75);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd packages/tui && bun test src/theme/colors.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement**

Write `packages/tui/src/theme/colors.ts`:

```ts
/**
 * ANSI-256 color map for the Titrate TUI. Each brand token maps to
 * the closest ANSI-256 index. Mirrors the Color Palette from the
 * brand/theme spec. Do not use raw hex or raw ANSI numbers in TUI
 * components — import from here.
 */
export const colors = {
  ink: {
    n950: 232, // #080808 ~ #0b0d10
    n900: 234, // #1c1c1c ~ #12151a
    n800: 236, // #303030 ~ #1f2328
    n700: 238, // #444444 ~ #30363d
    n500: 244, // #808080 ~ #7d8590
    n100: 252, // #d0d0d0 ~ #e6edf3
  },
  pink: {
    n400: 205, // #ff5fd7 ~ #f06ba3
    n500: 169, // #d75faf ~ #d63384
    n600: 132, // #af005f ~ #b02473
  },
  ok: 71,    // #5faf5f ~ #3fb950
  warn: 178, // #d7af00 ~ #d29922
  err: 203,  // #ff5f5f ~ #f85149
  info: 75,  // #5fafff ~ #58a6ff
} as const;

export type Colors = typeof colors;
```

- [ ] **Step 4: Run to pass**

Run: `cd packages/tui && bun test src/theme/colors.test.ts`
Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/theme/colors.ts packages/tui/src/theme/colors.test.ts
git commit -m "feat(tui/theme): add ANSI-256 color map aligned to brand palette"
```

---

## Task 28: Create TUI `theme/symbols.ts`

**Files:**
- Create: `packages/tui/src/theme/symbols.ts`
- Create: `packages/tui/src/theme/symbols.test.ts`

- [ ] **Step 1: Write the test**

Write `packages/tui/src/theme/symbols.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { symbols } from "./symbols";

describe("TUI symbols", () => {
  it("mark is U+222B integral sign", () => {
    expect(symbols.mark).toBe("\u222B");
  });

  it("status glyphs are single bullet / tick / cross chars", () => {
    expect(symbols.dot).toBe("\u2022");
    expect(symbols.check).toBe("\u2713");
    expect(symbols.cross).toBe("\u2717");
  });

  it("eq-point circle is U+25CB (white circle)", () => {
    expect(symbols.eqCircle).toBe("\u25CB");
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/tui/src/theme/symbols.ts`:

```ts
/**
 * Unicode symbols used across the TUI. Using a typed constant map
 * prevents inline string literals from drifting (e.g., bullet vs. dot).
 * Brand mark is the integral sign ∫ as the single-char inline fallback
 * for contexts where the three-line ASCII splash won't fit.
 */
export const symbols = {
  mark: "\u222B",      // ∫
  eqCircle: "\u25CB",  // ○
  dot: "\u2022",       // •
  check: "\u2713",     // ✓
  cross: "\u2717",     // ✗
  chevron: "\u203A",   // ›
} as const;

export type Symbols = typeof symbols;
```

- [ ] **Step 4: Run to pass** — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/theme/symbols.ts packages/tui/src/theme/symbols.test.ts
git commit -m "feat(tui/theme): add Unicode symbol constants"
```

---

## Task 29: Create TUI `theme/splash.ts`

**Files:**
- Create: `packages/tui/src/theme/splash.ts`
- Create: `packages/tui/src/theme/splash.test.ts`

- [ ] **Step 1: Write the test**

Write `packages/tui/src/theme/splash.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { splashLines, splashWidth } from "./splash";

describe("TUI splash", () => {
  it("returns three content lines matching the _/● banner", () => {
    expect(splashLines).toEqual([
      "       _____",
      "      /",
      "     \u25CF",
      " ____/",
    ]);
  });

  it("splashWidth matches the longest line", () => {
    expect(splashWidth).toBe(Math.max(...splashLines.map((l) => l.length)));
  });
});
```

- [ ] **Step 2: Run to fail**.

- [ ] **Step 3: Implement**

Write `packages/tui/src/theme/splash.ts`:

```ts
/**
 * TUI startup splash: ASCII titration-curve banner. Renders above
 * the command prompt on first launch. Equivalence-point marker is
 * U+25CF (BLACK CIRCLE). Lines use spaces only (no tabs) so terminal
 * emulators render them consistently.
 */
export const splashLines: readonly string[] = [
  "       _____",
  "      /",
  "     \u25CF",
  " ____/",
];

export const splashWidth: number = Math.max(...splashLines.map((l) => l.length));
```

- [ ] **Step 4: Run to pass** — 2/2.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/theme/splash.ts packages/tui/src/theme/splash.test.ts
git commit -m "feat(tui/theme): add ASCII _/● startup splash"
```

---

## Task 30: Create TUI `theme/index.ts` barrel

**Files:**
- Create: `packages/tui/src/theme/index.ts`

- [ ] **Step 1: Write barrel**

Write `packages/tui/src/theme/index.ts`:

```ts
export { colors, type Colors } from "./colors";
export { symbols, type Symbols } from "./symbols";
export { splashLines, splashWidth } from "./splash";
```

- [ ] **Step 2: Run all TUI theme tests**

Run: `cd packages/tui && bun test src/theme`
Expected: all 3 theme test files pass (8 tests total across colors + symbols + splash).

- [ ] **Step 3: Run the full TUI regression to verify nothing broke**

Run: `cd packages/tui && bun test`
Expected: existing TUI tests continue to pass; the new theme tests add to the count.

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/theme/index.ts
git commit -m "feat(tui/theme): barrel export for theme module"
```

---

## Task 31: Wire the TUI splash into startup (one-screen reference migration)

**Files:**
- Modify: `packages/tui/src/index.tsx` (if splash insertion lives at top-level entry; otherwise a Dashboard or startup view)

- [ ] **Step 1: Locate the appropriate insertion point**

Run: `grep -nR "titrate" packages/tui/src | head -20` — find where the app banner or welcome text prints. Typical candidates: `src/index.tsx`, `src/App.tsx`, or a `src/interactive/Welcome.tsx`. The goal is to add the splash as plain text, rendered once at app start, using the new theme module.

- [ ] **Step 2: Add the splash render**

In the file identified in step 1, import the theme module:

```ts
import { colors, splashLines, symbols } from "./theme";
```

Replace any hardcoded banner (e.g., "Titrate — offline-first airdrop platform") with a block that prints `splashLines` in `colors.pink.n500` followed by `titrate   sovereign airdrop tooling` on a new line. In OpenTUI React, this looks like:

```tsx
<box flexDirection="column" marginBottom={1}>
  {splashLines.map((line, i) => (
    <text key={i} fg={colors.pink.n500}>{line}</text>
  ))}
  <text marginTop={1}>
    <text fg={colors.pink.n500}>{symbols.mark} </text>
    <text bold>titrate</text>
    <text fg={colors.ink.n500}>   sovereign airdrop tooling</text>
  </text>
</box>
```

If the file uses plain stdout writes, use:

```ts
for (const line of splashLines) {
  process.stdout.write(`\x1b[38;5;${colors.pink.n500}m${line}\x1b[0m\n`);
}
process.stdout.write(`\n\x1b[38;5;${colors.pink.n500}m${symbols.mark}\x1b[0m \x1b[1mtitrate\x1b[0m   \x1b[38;5;${colors.ink.n500}msovereign airdrop tooling\x1b[0m\n`);
```

Pick the form that matches the file's existing pattern.

- [ ] **Step 3: Verify TUI still boots cleanly**

Run: `cd packages/tui && bun run src/index.tsx new --help` (or the quickest way to boot the TUI without needing full interactive input — see the `titrate-tui-smoke` skill in `.claude/skills/` if available).
Expected: TUI launches, splash renders in pink, no runtime errors.

- [ ] **Step 4: Run the TUI test suite**

Run: `cd packages/tui && bun test`
Expected: all previous tests still pass; any test that asserted on the old banner text has been updated to expect the new splash (if such a test exists, update it inline).

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/index.tsx packages/tui/src/App.tsx packages/tui/src/interactive/Welcome.tsx 2>/dev/null
git commit -m "feat(tui): swap legacy banner for brand splash (∫ curve + sovereign tagline)"
```

Note: the `git add` line covers likely candidates; only the files actually modified will be staged.

---

## Task 32: Root regression pass + final commit

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full monorepo regression**

From the repo root:

```bash
yarn test:all
```

Expected: all packages pass. The counts should include:
- New web tests: ~16 component files × 2–6 tests each = roughly 50+ new passing tests
- New TUI tests: 3 theme files = 8 new passing tests
- All previously-passing tests remain passing

- [ ] **Step 2: Run typecheck**

```bash
cd packages/web && npx tsc --noEmit
cd packages/tui && npx tsc --noEmit
```

Expected: exit 0 for both.

- [ ] **Step 3: Build the web package**

```bash
cd packages/web && yarn build
```

Expected: build succeeds. Inspect bundle size report — the new CSS `@theme` layer + component library should add ~8–15 KB gzipped. If it's larger, something pulled in an unexpected dep — investigate and trim.

- [ ] **Step 4: Manual smoke in the browser**

```bash
cd packages/web && yarn dev
```

Open `http://localhost:5173`. Open devtools and confirm:
- `document.documentElement.dataset.theme` is `"light"` or `"dark"` (matches OS pref)
- No CSP errors, no font 404s
- Favicon shows the pink titration mark in a cream tile

Stop the dev server.

- [ ] **Step 5: Final commit (if any uncommitted fixes from the regression pass exist)**

```bash
git status
# If any tests / fixtures needed updating, stage and commit them:
git add <files>
git commit -m "chore: fix up residual test fixtures after brand rollout"
```

If there are no residual changes, skip the commit — the plan is done.

---

## Done criteria

The plan is complete when:

1. All 32 tasks are checked off.
2. `yarn test:all` passes clean.
3. `cd packages/web && yarn build` succeeds.
4. The web dev server boots, shows the favicon, respects OS dark/light preference, and has no CSP / font errors in the console.
5. The TUI boots with the new splash banner in pink.
6. The brand/theme spec's "Implementation notes" section lines up with what exists on disk: `packages/web/src/components/ui/` contains the 15 components + barrel; `packages/tui/src/theme/` contains `colors.ts`, `symbols.ts`, `splash.ts`, `index.ts`; `packages/web/public/mark.svg` and `mark-tile.svg` exist.

Page-level migrations (CampaignList, WalletSetup, etc. adopting the new library) are out of scope for this plan and happen per-page as those screens get redesigned.
