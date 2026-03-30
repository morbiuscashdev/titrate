/**
 * Memory monitoring utilities.
 *
 * Provides heap usage tracking and warnings during long-running operations
 * like CSV parsing and block scanning. Works in both Node.js and browsers.
 */

export type MemoryWarning = {
  readonly heapUsedMB: number;
  readonly heapLimitMB: number;
  readonly usagePercent: number;
  readonly message: string;
};

export type MemoryWarningCallback = (warning: MemoryWarning) => void;

/**
 * Returns current heap usage in MB, or null if unavailable.
 * Works in Node.js via `process.memoryUsage()` and Chrome via `performance.memory`.
 */
export function getHeapUsageMB(): number | null {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return Math.round(process.memoryUsage().heapUsed / 1_048_576);
  }
  // Chrome-only: performance.memory (non-standard)
  const perf = globalThis.performance as unknown as { memory?: { usedJSHeapSize: number } };
  if (perf?.memory) {
    return Math.round(perf.memory.usedJSHeapSize / 1_048_576);
  }
  return null;
}

/**
 * Returns the heap limit in MB, or a conservative default.
 */
export function getHeapLimitMB(): number {
  if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    // V8 heap statistics via process
    try {
      const v8 = (globalThis as unknown as { require?: (m: string) => { getHeapStatistics: () => { heap_size_limit: number } } }).require?.('v8');
      if (v8) {
        return Math.round(v8.getHeapStatistics().heap_size_limit / 1_048_576);
      }
    } catch {
      // v8 module not available
    }
    // Fallback: Node default is ~4GB on 64-bit
    return 4096;
  }
  const perf = globalThis.performance as unknown as { memory?: { jsHeapSizeLimit: number } };
  if (perf?.memory) {
    return Math.round(perf.memory.jsHeapSizeLimit / 1_048_576);
  }
  return 2048; // Conservative browser default
}

/**
 * Creates a memory monitor that checks heap usage at a configurable interval.
 * Calls the warning callback when usage exceeds the threshold percentage.
 *
 * @param onWarning - Called when heap usage exceeds threshold
 * @param thresholdPercent - Warning threshold (default: 70%)
 * @param checkIntervalMs - How often to check (default: 5000ms)
 * @returns A stop function to cancel monitoring
 */
export function createMemoryMonitor(
  onWarning: MemoryWarningCallback,
  { thresholdPercent = 70, checkIntervalMs = 5000 } = {},
): () => void {
  const interval = setInterval(() => {
    const heapUsedMB = getHeapUsageMB();
    if (heapUsedMB === null) return;

    const heapLimitMB = getHeapLimitMB();
    const usagePercent = Math.round((heapUsedMB / heapLimitMB) * 100);

    if (usagePercent >= thresholdPercent) {
      onWarning({
        heapUsedMB,
        heapLimitMB,
        usagePercent,
        message: `Heap usage at ${usagePercent}% (${heapUsedMB}MB / ${heapLimitMB}MB). Consider increasing with --max-old-space-size.`,
      });
    }
  }, checkIntervalMs);

  return () => clearInterval(interval);
}
