import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorPanel } from "./OperatorPanel";

describe("OperatorPanel", () => {
  it("renders children inside a dark ink panel", () => {
    render(<OperatorPanel data-testid="p">inside</OperatorPanel>);
    const p = screen.getByTestId("p");
    expect(p.className).toContain("bg-[color:var(--color-ink-950)]");
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("applies data-mode=operator on the panel", () => {
    render(<OperatorPanel data-testid="p">x</OperatorPanel>);
    expect(screen.getByTestId("p").getAttribute("data-mode")).toBe("operator");
  });

  it("renders an outer cream/ink frame via 2px border + offset shadow", () => {
    render(<OperatorPanel data-testid="p">x</OperatorPanel>);
    expect(screen.getByTestId("p").className).toContain("border-2");
    expect(screen.getByTestId("p").className).toContain("shadow-[4px_4px_0_var(--shadow-color)]");
  });
});
