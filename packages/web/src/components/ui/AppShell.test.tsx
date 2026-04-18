import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";

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

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
    stubMatchMedia(false);
  });

  it("renders nav with Mark + wordmark", () => {
    render(
      <AppShell
        nav={[{ label: "Campaigns", href: "/" }]}
        activeHref="/"
      >
        <p>page content</p>
      </AppShell>
    );
    expect(screen.getByRole("img", { name: /titrate/i })).toBeInTheDocument();
    expect(screen.getByText("titrate")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("marks the active nav item", () => {
    render(
      <AppShell
        nav={[{ label: "Campaigns", href: "/c" }, { label: "Wallets", href: "/w" }]}
        activeHref="/w"
      >
        <p>x</p>
      </AppShell>
    );
    expect(screen.getByText("Wallets").className).toContain("border-b-[3px]");
    expect(screen.getByText("Campaigns").className).not.toContain("border-b-[3px]");
  });

  it("wraps content in data-mode=brutalist", () => {
    render(
      <AppShell nav={[]} activeHref="">
        <p data-testid="content">x</p>
      </AppShell>
    );
    const wrapper = screen.getByTestId("content").closest("[data-mode]");
    expect(wrapper?.getAttribute("data-mode")).toBe("brutalist");
  });
});
