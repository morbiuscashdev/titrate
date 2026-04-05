export type ProgressRingProps = {
  readonly percent: number;
  readonly size?: number;
  readonly label?: string;
};

export function ProgressRing({ percent, size = 64, label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-300 dark:text-gray-700" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-blue-500 transition-all duration-300" />
      </svg>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{clamped}%</span>
      {label && <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>}
    </div>
  );
}
