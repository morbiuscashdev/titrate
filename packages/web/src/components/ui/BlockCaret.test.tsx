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
    // jsdom normalizes #d63384 to rgb(214, 51, 132)
    expect(caret.style.background).toMatch(/rgb\(214,\s*51,\s*132\)|#d63384/i);
  });

  it("is hidden from screen readers", () => {
    render(<BlockCaret />);
    expect(screen.getByTestId("block-caret").getAttribute("aria-hidden")).toBe("true");
  });
});
