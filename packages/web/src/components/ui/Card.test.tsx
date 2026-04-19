import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>inner</Card>);
    expect(screen.getByText("inner")).toBeInTheDocument();
  });

  it("brutalist: 2px border, offset shadow, 0 radius", () => {
    render(<ModeProvider mode="brutalist"><Card data-testid="c">x</Card></ModeProvider>);
    expect(screen.getByTestId("c").className).toContain("border-2");
    expect(screen.getByTestId("c").className).toContain("shadow-[4px_4px_0_var(--shadow-color)]");
    expect(screen.getByTestId("c").className).toContain("rounded-none");
  });

  it("operator: 1px border, 8px radius, no offset shadow", () => {
    render(<ModeProvider mode="operator"><Card data-testid="c">x</Card></ModeProvider>);
    expect(screen.getByTestId("c").className).toContain("rounded-lg");
    expect(screen.getByTestId("c").className).toContain("border");
  });
});
