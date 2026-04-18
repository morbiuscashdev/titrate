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
