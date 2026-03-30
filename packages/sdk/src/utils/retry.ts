const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

export type RetryOptions = {
  readonly maxRetries?: number;
  readonly baseDelay?: number;
};

function isRateLimitError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('429') || msg.includes('rate') || msg.includes('Too Many Requests');
}

/**
 * Retries an async operation with exponential backoff.
 * Rate limit errors (429) are penalized with a 5× delay multiplier.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  { maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt > maxRetries) break;

      let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      if (isRateLimitError(err)) delay *= 5;
      delay += delay * Math.random() * 0.3;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
