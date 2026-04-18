import { useId, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: string;
};

export function Checkbox({ label, id, ...rest }: Props) {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <label htmlFor={inputId} className="inline-flex items-center gap-2 font-sans text-sm text-[color:var(--fg-primary)] cursor-pointer select-none">
      <input
        id={inputId}
        type="checkbox"
        style={{ accentColor: "#d63384" }}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
