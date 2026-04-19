import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders text", () => {
    render(<Pill tone="ok">running</Pill>);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("operator ok pill uses semantic ok color family", () => {
    render(<ModeProvider mode="operator"><Pill tone="ok">running</Pill></ModeProvider>);
    const el = screen.getByText("running").closest("span");
    expect(el?.className).toContain("text-[color:var(--color-ok)]");
  });

  it("brutalist ok pill uses chip-green background", () => {
    render(<ModeProvider mode="brutalist"><Pill tone="ok">running</Pill></ModeProvider>);
    const el = screen.getByText("running").closest("span");
    expect(el?.className).toContain("bg-[color:var(--color-chip-green)]");
  });

  it("shows leading dot when dot prop is true", () => {
    render(<Pill tone="ok" dot>live</Pill>);
    expect(screen.getByTestId("pill-dot")).toBeInTheDocument();
  });
});
