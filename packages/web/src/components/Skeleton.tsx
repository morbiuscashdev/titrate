export type SkeletonProps = {
  readonly className?: string;
};

/** Animated placeholder for content that's loading. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      data-testid="skeleton"
      className={`animate-pulse bg-[color:var(--edge)]/30 ${className}`}
    />
  );
}
