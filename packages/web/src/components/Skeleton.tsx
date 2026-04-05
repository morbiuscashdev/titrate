export type SkeletonProps = {
  readonly className?: string;
};

/** Animated placeholder for content that's loading. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      data-testid="skeleton"
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className}`}
    />
  );
}
