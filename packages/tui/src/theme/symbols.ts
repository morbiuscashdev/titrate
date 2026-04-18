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
