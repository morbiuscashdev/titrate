/**
 * Parses a gwei string (e.g., "50", "2.5") to wei as bigint.
 */
export function parseGwei(value: string): bigint {
  const [whole, decimal = ''] = value.split('.');
  const padded = decimal.padEnd(9, '0').slice(0, 9);
  return BigInt(whole) * 1_000_000_000n + BigInt(padded);
}
