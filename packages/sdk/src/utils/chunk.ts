/**
 * Splits an array into chunks of the given size.
 * The last chunk may be smaller if the array length is not divisible by size.
 */
export function chunk<T>(array: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size) as T[]);
  }
  return chunks;
}
