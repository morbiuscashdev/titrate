import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Input } from "./Input";

describe("Input", () => {
  it("renders an input element with label", () => {
    render(<Input label="Campaign name" />);
    expect(screen.getByLabelText("Campaign name")).toBeInTheDocument();
  });

  it("brutalist: 2px border, offset shadow, 0 radius", () => {
    render(
      <ModeProvider mode="brutalist">
        <Input label="Address" />
      </ModeProvider>
    );
    const input = screen.getByLabelText("Address");
    expect(input.className).toContain("border-2");
    expect(input.className).toContain("rounded-none");
    expect(input.className).toContain("shadow-[3px_3px_0_var(--shadow-color)]");
  });

  it("operator: 1px border, ink-900 bg, 6px radius", () => {
    render(
      <ModeProvider mode="operator">
        <Input label="Address" />
      </ModeProvider>
    );
    const input = screen.getByLabelText("Address");
    expect(input.className).toContain("bg-[color:var(--color-ink-900)]");
    expect(input.className).toContain("rounded-md");
  });

  it("accepts value + onChange", () => {
    let value = "";
    const { rerender } = render(
      <Input label="X" value={value} onChange={(e) => { value = e.target.value; }} />
    );
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "hex-airdrop" } });
    expect(value).toBe("hex-airdrop");
    rerender(<Input label="X" value={value} onChange={() => {}} />);
  });
});
