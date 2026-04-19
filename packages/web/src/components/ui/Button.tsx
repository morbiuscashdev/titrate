import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useMode } from "../../theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const SIZE_OPERATOR: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1",
  md: "text-sm px-3.5 py-1.5",
  lg: "text-sm px-4 py-2.5",
};

const SIZE_BRUTALIST: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1 shadow-[2px_2px_0_var(--shadow-color)]",
  md: "text-sm px-4 py-2.5 shadow-[3px_3px_0_var(--shadow-color)]",
  lg: "text-base px-5 py-3 shadow-[3px_3px_0_var(--shadow-color)]",
};

const VARIANT_OPERATOR: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--color-pink-600)] text-white hover:bg-[color:var(--color-pink-700)]",
  secondary: "bg-[color:var(--color-ink-800)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] hover:bg-[color:var(--color-ink-700)] hover:border-[color:var(--color-ink-500)]",
  ghost: "bg-transparent text-[color:var(--color-ink-100)] hover:bg-[color:var(--color-ink-800)]",
  danger: "bg-transparent text-[color:var(--color-err)] border border-[color:var(--color-ink-700)] hover:bg-[color:var(--color-err)]/10 hover:border-[color:var(--color-err)]",
};

const VARIANT_BRUTALIST: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--color-pink-600)] text-white border-2 border-[color:var(--edge)] hover:bg-[color:var(--color-pink-700)]",
  secondary: "bg-[color:var(--color-cream-100)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
  ghost: "bg-[color:var(--bg-page)] text-[color:var(--fg-primary)] border-2 border-[color:var(--edge)]",
  danger: "bg-[color:var(--color-chip-pink)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)]",
};

const BRUTALIST_PRESS = "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--shadow-color)]";

export function Button({
  variant = "secondary",
  size = "md",
  disabled,
  children,
  ...rest
}: Props) {
  const mode = useMode();
  const base = "inline-flex items-center justify-center font-sans font-semibold leading-tight transition-[background-color,transform,box-shadow] duration-[80ms] focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]";
  const motion = mode === "brutalist" ? BRUTALIST_PRESS : "";
  const shape = mode === "brutalist" ? "rounded-none" : "rounded-md";
  const sizeClass = mode === "brutalist" ? SIZE_BRUTALIST[size] : SIZE_OPERATOR[size];
  const variantClass = mode === "brutalist" ? VARIANT_BRUTALIST[variant] : VARIANT_OPERATOR[variant];
  const disabledClass = disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer";
  return (
    <button
      type="button"
      disabled={disabled}
      data-motion={mode === "brutalist" ? "press-translate" : undefined}
      className={`${base} ${shape} ${sizeClass} ${variantClass} ${motion} ${disabledClass}`}
      {...rest}
    >
      {children}
    </button>
  );
}
