import { describe, it, expect, beforeEach } from "vitest";
import { readStoredTheme, writeStoredTheme, detectInitialTheme, applyTheme, resolveTheme } from "./set-theme";

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

  it("detectInitialTheme defaults to 'system' when nothing is stored", () => {
    stubMatchMedia(true);
    expect(detectInitialTheme()).toBe("system");
  });

  it("resolveTheme returns the explicit value for light/dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolveTheme('system') consults OS preference", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("applyTheme writes the resolved value to data-theme", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    stubMatchMedia(true);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
