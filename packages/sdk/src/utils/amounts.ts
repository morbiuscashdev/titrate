import type { AmountFormat } from '../types.js';

/**
 * Converts a decimal string to a bigint scaled by the given number of decimals.
 *
 * Truncates excess decimal places; pads short fractional parts with zeros.
 *
 * @example
 * decimalToInteger('1.5', 18) // 1_500_000_000_000_000_000n
 * decimalToInteger('1.123456789', 6) // 1_123_456n
 */
export function decimalToInteger(decimalStr: string, decimals: number): bigint {
  const [wholePart, fracPart = ''] = decimalStr.split('.');
  const paddedFrac = fracPart.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0');
}

/**
 * Converts an array of raw amount strings (e.g. from CSV) to bigint[].
 *
 * Null entries become 0n. Decimal strings are converted using the token's
 * decimal count via {@link decimalToInteger}.
 *
 * @example
 * parseVariableAmounts(['1.5', null], 'decimal', 18)
 * // [1_500_000_000_000_000_000n, 0n]
 */
export function parseVariableAmounts(
  rawAmounts: readonly (string | null)[],
  format: AmountFormat,
  decimals: number,
): bigint[] {
  return rawAmounts.map((raw) => {
    if (!raw) return 0n;
    if (format === 'decimal') return decimalToInteger(raw, decimals);
    return BigInt(raw);
  });
}
