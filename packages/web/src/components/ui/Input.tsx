import { useId, type InputHTMLAttributes } from "react";
import { useMode } from "../../theme";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, id, ...rest }: Props) {
  const mode = useMode();
  const reactId = useId();
  const inputId = id ?? reactId;

  const labelClass = mode === "brutalist"
    ? "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2"
    : "block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5";

  const inputBase = "w-full font-sans text-sm leading-tight outline-none transition-[box-shadow,border-color] duration-[80ms]";

  const inputBrutalist = "rounded-none bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] shadow-[3px_3px_0_var(--shadow-color)] px-3 py-2 font-mono focus:border-[color:var(--color-pink-500)] focus:shadow-[3px_3px_0_var(--color-pink-500)] placeholder:text-[color:var(--color-cream-700)]";

  const inputOperator = "rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] px-3 py-1.5 focus:shadow-[0_0_0_3px_var(--color-pink-500)] placeholder:text-[color:var(--color-ink-500)] caret-[color:var(--color-pink-500)]";

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <input
        id={inputId}
        className={`${inputBase} ${mode === "brutalist" ? inputBrutalist : inputOperator}`}
        {...rest}
      />
      {hint ? (
        <p className={`mt-1 text-xs ${mode === "brutalist" ? "text-[color:var(--color-cream-700)] font-mono" : "text-[color:var(--color-ink-500)]"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
