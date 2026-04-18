import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("renders with label and rows", () => {
    render(<Textarea label="Notes" rows={4} />);
    const ta = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.rows).toBe(4);
  });

  it("brutalist styling applies", () => {
    render(<ModeProvider mode="brutalist"><Textarea label="X" /></ModeProvider>);
    expect(screen.getByLabelText("X").className).toContain("border-2");
  });

  it("operator styling applies", () => {
    render(<ModeProvider mode="operator"><Textarea label="X" /></ModeProvider>);
    expect(screen.getByLabelText("X").className).toContain("bg-[color:var(--color-ink-900)]");
  });
});
