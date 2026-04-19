import { useId, type SelectHTMLAttributes } from "react";
import { useMode } from "../../theme";

type Option = { value: string; label: string };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
  label: string;
  options: Option[];
};

export function Select({ label, options, id, ...rest }: Props) {
  const mode = useMode();
  const reactId = useId();
  const selId = id ?? reactId;

  const labelClass = mode === "brutalist"
    ? "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2"
    : "block font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-ink-500)] mb-1.5";

  const base = "w-full font-sans text-sm leading-tight outline-none transition-[box-shadow,border-color] duration-[80ms] cursor-pointer";

  const brut = "rounded-none bg-white text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] shadow-[3px_3px_0_var(--shadow-color)] px-3 py-2 font-mono focus:border-[color:var(--color-pink-500)] focus:shadow-[3px_3px_0_var(--color-pink-500)]";

  const op = "rounded-md bg-[color:var(--color-ink-900)] text-[color:var(--color-ink-100)] border border-[color:var(--color-ink-700)] px-3 py-1.5 focus:shadow-[0_0_0_3px_var(--color-pink-500)]";

  return (
    <div>
      <label htmlFor={selId} className={labelClass}>{label}</label>
      <select
        id={selId}
        className={`${base} ${mode === "brutalist" ? brut : op}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
