import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and sub text", () => {
    render(<StatCard label="Batches" value="42" sub="40 included · 1 reverted · 1 pending" />);
    expect(screen.getByText("Batches")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/40 included/)).toBeInTheDocument();
  });
});
