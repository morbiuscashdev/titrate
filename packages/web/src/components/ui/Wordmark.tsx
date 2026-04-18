import { Mark } from "./Mark";

const SIZES = {
  nav: { mark: 32, text: "text-[22px]" },
  hero: { mark: 150, text: "text-5xl" },
} as const;

export function Wordmark({ size }: { size: "nav" | "hero" }) {
  const { mark, text } = SIZES[size];
  return (
    <span className="inline-flex items-center gap-3 text-[color:var(--mark-color)]">
      <Mark size={mark} />
      <span className={`${text} font-sans font-extrabold tracking-[-0.02em] text-[color:var(--fg-primary)]`}>
        titrate
      </span>
    </span>
  );
}
