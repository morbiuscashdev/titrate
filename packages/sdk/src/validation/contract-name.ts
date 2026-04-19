/**
 * Characters permitted in a Solidity identifier. Used to validate the
 * user-chosen contract display name so that substituting it into a source
 * template produces compilable Solidity (and valid submissions to block
 * explorer verification endpoints).
 */
const SOLIDITY_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;

/** Upper bound on name length. Solidity has no spec limit but long names
 * bloat compiled metadata; explorers also impose their own cutoffs. */
const MAX_CONTRACT_NAME_LENGTH = 64;

/**
 * Reserved Solidity keywords that would fail compilation if used as a
 * contract name. Not exhaustive — just the words a reasonable user might
 * try (e.g. `Contract`, `Token`, `Address`).
 */
const RESERVED_KEYWORDS = new Set<string>([
  'abstract', 'after', 'alias', 'apply', 'auto', 'case', 'catch', 'contract',
  'copyof', 'default', 'define', 'final', 'function', 'immutable', 'implements',
  'in', 'inline', 'interface', 'let', 'library', 'macro', 'match', 'mutable',
  'null', 'of', 'override', 'partial', 'promise', 'reference', 'relocatable',
  'sealed', 'sizeof', 'static', 'struct', 'supports', 'switch', 'try', 'type',
  'typedef', 'typeof', 'unchecked', 'virtual',
]);

export type ContractNameValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Validates a user-entered contract display name.
 *
 * Accepts: a non-empty string whose every character is `[A-Za-z_$0-9]`, the
 * first character is not a digit, length is ≤ 64, and it's not a reserved
 * Solidity keyword.
 *
 * Returns a discriminated union with the trimmed value on success and a
 * human-readable reason on failure.
 */
export function validateContractName(input: string): ContractNameValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Contract name is required.' };
  }
  if (trimmed.length > MAX_CONTRACT_NAME_LENGTH) {
    return {
      ok: false,
      reason: `Contract name must be ${MAX_CONTRACT_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (!SOLIDITY_IDENTIFIER_RE.test(trimmed)) {
    return {
      ok: false,
      reason: 'Contract name must start with a letter, `_`, or `$` and contain only letters, digits, `_`, or `$`.',
    };
  }
  if (RESERVED_KEYWORDS.has(trimmed.toLowerCase())) {
    return { ok: false, reason: `"${trimmed}" is a reserved Solidity keyword.` };
  }
  return { ok: true, value: trimmed };
}

/** Convenience boolean form of `validateContractName`. */
export function isValidContractName(input: string): boolean {
  return validateContractName(input).ok;
}
