import type { ReactNode } from "react";
import { useMode } from "../../theme";

export type PillTone = "ok" | "warn" | "err" | "info" | "neutral";

const OP_TONE: Record<PillTone, string> = {
  ok: "bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)] border border-[color:var(--color-ok)]/30",
  warn: "bg-[color:var(--color-warn)]/10 text-[color:var(--color-warn)] border border-[color:var(--color-warn)]/30",
  err: "bg-[color:var(--color-err)]/10 text-[color:var(--color-err)] border border-[color:var(--color-err)]/30",
  info: "bg-[color:var(--color-info)]/10 text-[color:var(--color-info)] border border-[color:var(--color-info)]/30",
  neutral: "bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)]",
};

const BRUT_TONE: Record<PillTone, string> = {
  ok: "bg-[color:var(--color-chip-green)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  warn: "bg-[color:var(--color-chip-yellow)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  err: "bg-[color:var(--color-chip-pink)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  info: "bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  neutral: "bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
};

export function Pill({ tone, dot, children }: { tone: PillTone; dot?: boolean; children: ReactNode }) {
  const mode = useMode();
  const base = mode === "brutalist"
    ? "inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] px-2 py-0.5"
    : "inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded-full";
  const toneClass = mode === "brutalist" ? BRUT_TONE[tone] : OP_TONE[tone];
  return (
    <span className={`${base} ${toneClass}`}>
      {dot ? <span data-testid="pill-dot" className="w-1.5 h-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
