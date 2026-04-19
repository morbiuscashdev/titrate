import { createContext, useContext, type ReactNode, type HTMLAttributes } from "react";

export type Mode = "brutalist" | "operator";

const ModeContext = createContext<Mode>("brutalist");

/**
 * ModeProvider sets a data-mode attribute on a wrapper div AND publishes
 * the mode through React context so descendants can branch JSX without
 * walking the DOM. Components imported from `components/ui/` read the
 * context to pick their variant.
 */
export function ModeProvider({
  mode,
  children,
  className,
  ...rest
}: {
  mode: Mode;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div data-mode={mode} className={className} {...rest}>
      <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>
    </div>
  );
}

export function useMode(): Mode {
  return useContext(ModeContext);
}
