import type { HTMLAttributes, ReactNode } from "react";
import { ModeProvider } from "../../theme";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

/**
 * A dark operator-A surface embedded in a brutalist chassis.
 * Publishes data-mode="operator" and a React context so descendants
 * render in operator-A styling even though the surrounding page is
 * brutalist. The 2px outer border + 4px offset shadow adopt the
 * current brutalist surface (cream-900 on light, ink-100 on dark)
 * so the panel reads as framed by the workbench.
 */
export function OperatorPanel({ children, className = "", ...rest }: Props) {
  return (
    <ModeProvider
      mode="operator"
      className={`bg-[color:var(--color-ink-950)] text-[color:var(--color-ink-100)] border-2 border-[color:var(--edge)] shadow-[4px_4px_0_var(--shadow-color)] p-4 ${className}`}
      {...rest}
    >
      {children}
    </ModeProvider>
  );
}
