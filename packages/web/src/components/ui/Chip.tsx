import type { ReactNode } from "react";

const BG: Record<"yellow" | "green" | "pink", string> = {
  yellow: "bg-[color:var(--color-chip-yellow)]",
  green: "bg-[color:var(--color-chip-green)]",
  pink: "bg-[color:var(--color-chip-pink)]",
};

export function Chip({ color, children }: { color: "yellow" | "green" | "pink"; children: ReactNode }) {
  return (
    <span
      className={`inline-block font-mono text-xs font-bold uppercase tracking-[0.1em] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] px-3 py-1.5 ${BG[color]}`}
    >
      {children}
    </span>
  );
}
