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
