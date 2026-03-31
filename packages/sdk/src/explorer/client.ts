export type ExplorerRawResponse = {
  readonly status: string;
  readonly message: string;
  readonly result: unknown;
};

export class ExplorerApiError extends Error {
  constructor(
    readonly explorerMessage: string,
    readonly explorerStatus: string,
    readonly isRateLimit: boolean,
  ) {
    super(`Explorer API error: ${explorerMessage}${isRateLimit ? ' (rate limited)' : ''}`);
    this.name = 'ExplorerApiError';
  }
}

export function isRateLimitResult(result: unknown): boolean {
  if (typeof result !== 'string') return false;
  return /rate limit|max rate/i.test(result);
}

const NO_RESULTS_MESSAGES = ['no transactions found', 'no records found'];

export function parseExplorerResponse<T>(data: ExplorerRawResponse): T {
  if (data.status === '1') {
    return data.result as T;
  }

  if (NO_RESULTS_MESSAGES.includes(data.message.toLowerCase())) {
    return (Array.isArray(data.result) ? data.result : []) as T;
  }

  const resultStr = typeof data.result === 'string' ? data.result : '';
  throw new ExplorerApiError(
    data.message,
    data.status,
    isRateLimitResult(resultStr),
  );
}
