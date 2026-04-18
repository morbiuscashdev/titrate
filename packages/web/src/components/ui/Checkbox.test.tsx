import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders a checkbox with label", () => {
    render(<Checkbox label="Use existing wallets" />);
    expect(screen.getByRole("checkbox", { name: "Use existing wallets" })).toBeInTheDocument();
  });

  it("reflects checked state", () => {
    render(<Checkbox label="x" checked readOnly />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("uses pink-500 accent color", () => {
    render(<Checkbox label="x" />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).style.accentColor).toContain("d63384");
  });
});
