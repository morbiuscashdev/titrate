import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeProvider } from "../../theme";
import { Button } from "./Button";

describe("Button", () => {
  it("renders as a button with the label", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });

  it("brutalist primary: pink-600 bg, 2px border, offset shadow classes", () => {
    render(
      <ModeProvider mode="brutalist">
        <Button variant="primary">Launch</Button>
      </ModeProvider>
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[color:var(--color-pink-600)]");
    expect(btn.className).toContain("border-2");
    expect(btn.className).toContain("shadow-[3px_3px_0_var(--shadow-color)]");
  });

  it("operator primary: pink-600 bg, rounded-md, no border", () => {
    render(
      <ModeProvider mode="operator">
        <Button variant="primary">Save</Button>
      </ModeProvider>
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[color:var(--color-pink-600)]");
    expect(btn.className).toContain("rounded-md");
  });

  it("forwards onClick", () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("renders small size with reduced padding", () => {
    render(<Button size="sm">Tiny</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-xs");
  });

  it("disabled buttons block clicks and drop opacity", () => {
    let clicked = false;
    render(<Button disabled onClick={() => { clicked = true; }}>No</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(false);
    expect(screen.getByRole("button").className).toContain("opacity-");
  });
});
