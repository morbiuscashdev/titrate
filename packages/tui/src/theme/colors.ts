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
