/**
 * Titrate brand mark — angular `_/` titration curve with a hollow
 * equivalence-point circle at the inflection. Uses currentColor by
 * default so parents can theme via CSS; pass `color` to override.
 */
export function Mark({ size, color }: { size: number; color?: string }) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 170 150"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="titrate"
    >
      <path
        d="M 14 120 L 65 120 L 95 30 L 156 30"
        stroke={stroke}
        strokeWidth={12}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx={80} cy={75} r={22} stroke={stroke} strokeWidth={8} />
    </svg>
  );
}
