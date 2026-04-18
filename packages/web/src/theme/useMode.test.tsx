import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeProvider, useMode } from "./useMode";

function ModeReadout() {
  const mode = useMode();
  return <span data-testid="readout">{mode}</span>;
}

describe("ModeProvider + useMode", () => {
  it("defaults to brutalist when no provider", () => {
    render(<ModeReadout />);
    expect(screen.getByTestId("readout").textContent).toBe("brutalist");
  });

  it("propagates mode through context", () => {
    render(
      <ModeProvider mode="operator">
        <ModeReadout />
      </ModeProvider>
    );
    expect(screen.getByTestId("readout").textContent).toBe("operator");
  });

  it("applies data-mode attribute on wrapper", () => {
    const { container } = render(
      <ModeProvider mode="brutalist">
        <span>hi</span>
      </ModeProvider>
    );
    expect(container.firstChild).toHaveAttribute("data-mode", "brutalist");
  });

  it("nested provider overrides parent", () => {
    render(
      <ModeProvider mode="brutalist">
        <ModeProvider mode="operator">
          <ModeReadout />
        </ModeProvider>
      </ModeProvider>
    );
    expect(screen.getByTestId("readout").textContent).toBe("operator");
  });

  it("forwards extra HTML attributes to the wrapper div", () => {
    const { container } = render(
      <ModeProvider mode="operator" data-testid="wrap">
        <span>x</span>
      </ModeProvider>
    );
    expect((container.firstChild as HTMLElement).dataset.testid).toBe("wrap");
  });
});
