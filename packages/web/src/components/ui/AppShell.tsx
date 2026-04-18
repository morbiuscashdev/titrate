import type { ReactNode } from "react";
import { ModeProvider } from "../../theme";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { label: string; href: string };

type Props = {
  nav: NavItem[];
  activeHref: string;
  children: ReactNode;
  right?: ReactNode;
};

export function AppShell({ nav, activeHref, children, right }: Props) {
  return (
    <ModeProvider mode="brutalist" className="min-h-screen bg-[color:var(--bg-page)] text-[color:var(--fg-primary)]">
      <nav className="flex items-center gap-5 px-5 py-4 border-b-2 border-[color:var(--edge)]">
        <Wordmark size="nav" />
        <div className="flex items-center gap-4 ml-4">
          {nav.map((item) => {
            const active = item.href === activeHref;
            const base = "font-mono text-xs font-bold uppercase tracking-[0.12em] pb-1 cursor-pointer";
            const activeCls = active ? "border-b-[3px] border-[color:var(--color-pink-500)]" : "";
            return (
              <a key={item.href} href={item.href} className={`${base} ${activeCls}`}>
                {item.label}
              </a>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <ThemeToggle />
        </div>
      </nav>
      <main className="px-5 py-6">{children}</main>
    </ModeProvider>
  );
}
