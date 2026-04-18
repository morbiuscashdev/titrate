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
