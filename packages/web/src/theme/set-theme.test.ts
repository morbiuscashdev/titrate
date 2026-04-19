import { describe, it, expect, beforeEach } from "vitest";
import { readStoredTheme, writeStoredTheme, detectInitialTheme, applyTheme } from "./set-theme";

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

describe("set-theme helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("readStoredTheme returns null when unset", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("writeStoredTheme + readStoredTheme round-trip", () => {
    writeStoredTheme("dark");
    expect(readStoredTheme()).toBe("dark");
    writeStoredTheme("light");
    expect(readStoredTheme()).toBe("light");
  });

  it("readStoredTheme returns null for invalid values", () => {
    localStorage.setItem("titrate-theme", "blue");
    expect(readStoredTheme()).toBeNull();
  });

  it("detectInitialTheme prefers stored value over OS preference", () => {
    writeStoredTheme("light");
    stubMatchMedia(true);
    expect(detectInitialTheme()).toBe("light");
  });

  it("detectInitialTheme falls back to OS preference", () => {
    stubMatchMedia(true);
    expect(detectInitialTheme()).toBe("dark");
  });

  it("detectInitialTheme returns light when OS preference is light", () => {
    stubMatchMedia(false);
    expect(detectInitialTheme()).toBe("light");
  });

  it("applyTheme sets data-theme on documentElement", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
