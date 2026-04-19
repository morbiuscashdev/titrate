import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

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

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
    stubMatchMedia(false);
  });

  it("defaults to 'system' when no preference is stored", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  it("reads the stored preference when present", () => {
    localStorage.setItem("titrate-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("setTheme('dark') updates state, DOM, and storage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("titrate-theme")).toBe("dark");
  });

  it("setTheme('system') resolves via matchMedia and stores 'system'", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("system"));
    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("titrate-theme")).toBe("system");
  });

  it("toggle flips resolved theme between light and dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.resolvedTheme).toBe("dark");
    act(() => result.current.toggle());
    expect(result.current.resolvedTheme).toBe("light");
  });
});
