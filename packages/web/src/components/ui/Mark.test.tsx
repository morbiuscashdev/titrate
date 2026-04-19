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
