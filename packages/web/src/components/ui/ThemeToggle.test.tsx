import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

function stubMatchMedia(darkMatches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? darkMatches : !darkMatches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
    stubMatchMedia(false);
  });

  it("renders two segment buttons", () => {
    render(<ThemeToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("system button is active by default (no stored preference)", () => {
    render(<ThemeToggle />);
    const systemButton = screen.getByLabelText("Use system theme");
    expect(systemButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking the light/dark segment persists an explicit preference", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Switch to dark theme"));
    expect(localStorage.getItem("titrate-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("clicking the system segment stores 'system'", () => {
    localStorage.setItem("titrate-theme", "dark");
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Use system theme"));
    expect(localStorage.getItem("titrate-theme")).toBe("system");
  });
});
