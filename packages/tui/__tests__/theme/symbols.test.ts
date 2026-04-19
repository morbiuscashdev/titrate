import { describe, it, expect } from "bun:test";
import { symbols } from "../../src/theme/symbols";

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
