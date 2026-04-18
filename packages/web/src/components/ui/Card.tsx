import type { ReactNode, HTMLAttributes } from "react";
import { useMode } from "../../theme";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function Card({ children, className = "", ...rest }: Props) {
  const mode = useMode();
  const base = "p-4";
  const brut = "bg-[color:var(--bg-card)] text-[color:var(--fg-primary)] border-2 border-[color:var(--edge)] rounded-none shadow-[4px_4px_0_var(--shadow-color)]";
  const op = "bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-800)] rounded-lg";
  return (
    <div className={`${base} ${mode === "brutalist" ? brut : op} ${className}`} {...rest}>
      {children}
    </div>
  );
}
