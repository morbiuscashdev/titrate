import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "./Select";

describe("Select", () => {
  it("renders a native select with options", () => {
    render(
      <Select label="Chain" options={[
        { value: "ethereum", label: "Ethereum" },
        { value: "arbitrum", label: "Arbitrum" },
      ]} />
    );
    const sel = screen.getByLabelText("Chain") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect(sel.options.length).toBe(2);
  });

  it("onChange fires with selected value", () => {
    let chosen = "";
    render(
      <Select label="Chain" options={[
        { value: "ethereum", label: "Ethereum" },
        { value: "arbitrum", label: "Arbitrum" },
      ]} onChange={(e) => { chosen = e.target.value; }} />
    );
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "arbitrum" } });
    expect(chosen).toBe("arbitrum");
  });
});
