export type MemoryWarningProps = {
  readonly heapUsedMB: number;
  readonly heapLimitMB: number;
  readonly usagePercent: number;
  readonly onDismiss?: () => void;
};

export function MemoryWarning({ heapUsedMB, heapLimitMB, usagePercent, onDismiss }: MemoryWarningProps) {
  return (
    <div className="rounded-md bg-yellow-400/10 p-4 ring-1 ring-inset ring-yellow-400/20">
      <div className="flex items-start gap-3">
        <span className="text-yellow-400 text-lg">!</span>
        <div className="flex-1 text-sm text-yellow-300">
          <p className="font-medium">High memory usage</p>
          <p className="mt-1 text-yellow-400/80">
            Heap at {usagePercent}% ({heapUsedMB}MB / {heapLimitMB}MB).
            Consider increasing with --max-old-space-size.
          </p>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-yellow-400 hover:text-yellow-300">&times;</button>
        )}
      </div>
    </div>
  );
}
