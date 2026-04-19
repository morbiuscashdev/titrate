import { describe, it, expect } from "bun:test";
import { splashLines, splashWidth } from "../../src/theme/splash";

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
