/**
 * Formatting helpers for the interactive wizard display.
 */

/**
 * Truncates an Ethereum address to `0x1234...5678` form.
 *
 * @param address - Full hex address string
 * @returns Truncated display string
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a number with thousands separators.
 *
 * @param n - Number to format
 * @returns Comma-separated string (e.g. `150,000`)
 */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Formats a raw token bigint amount into a human-readable string.
 * Applies the given decimals and appends the symbol.
 *
 * @param amount - Raw integer amount in smallest units
 * @param decimals - Token decimals (e.g. 18 for ETH, 8 for HEX)
 * @param symbol - Token symbol (e.g. "HEX", "ETH")
 * @returns Human-readable string (e.g. `1.5 HEX`)
 */
export function formatToken(amount: bigint, decimals: number, symbol: string): string {
  if (decimals === 0) return `${amount.toString()} ${symbol}`;

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) return `${whole.toString()} ${symbol}`;

  const fractionalStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionalStr} ${symbol}`;
}
