import { describe, it, expect } from 'vitest';
import {
  parseExplorerResponse,
  isRateLimitResult,
  ExplorerApiError,
} from '../../explorer/client.js';

describe('parseExplorerResponse', () => {
  it('returns result array on success', () => {
    const data = { status: '1', message: 'OK', result: [{ a: 1 }] };
    expect(parseExplorerResponse(data)).toEqual([{ a: 1 }]);
  });

  it('returns result string on success', () => {
    const data = { status: '1', message: 'OK', result: '12345' };
    expect(parseExplorerResponse(data)).toBe('12345');
  });

  it('throws ExplorerApiError on status 0 with non-rate-limit error', () => {
    const data = { status: '0', message: 'NOTOK', result: 'Invalid API key' };
    expect(() => parseExplorerResponse(data)).toThrow(ExplorerApiError);
    try {
      parseExplorerResponse(data);
    } catch (e) {
      const err = e as ExplorerApiError;
      expect(err.isRateLimit).toBe(false);
      expect(err.explorerMessage).toBe('NOTOK');
    }
  });

  it('throws ExplorerApiError with isRateLimit=true on rate limit', () => {
    const data = { status: '0', message: 'NOTOK', result: 'Max rate limit reached' };
    expect(() => parseExplorerResponse(data)).toThrow(ExplorerApiError);
    try {
      parseExplorerResponse(data);
    } catch (e) {
      expect((e as ExplorerApiError).isRateLimit).toBe(true);
    }
  });

  it('handles "No transactions found" as empty array', () => {
    const data = { status: '0', message: 'No transactions found', result: [] };
    expect(parseExplorerResponse(data)).toEqual([]);
  });
});

describe('isRateLimitResult', () => {
  it('detects "Max rate limit reached"', () => {
    expect(isRateLimitResult('Max rate limit reached')).toBe(true);
  });

  it('detects "rate limit" case-insensitively', () => {
    expect(isRateLimitResult('Rate Limit exceeded')).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isRateLimitResult('Invalid API key')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isRateLimitResult(undefined)).toBe(false);
  });
});
