import { describe, it, expect } from "bun:test";
import { colors } from "../../src/theme/colors";

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
