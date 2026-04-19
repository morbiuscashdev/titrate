import { describe, it, expect } from 'vitest';
import { validateContractName, isValidContractName } from '../validation/contract-name.js';

describe('validateContractName', () => {
  it.each([
    'TokenAirdrop',
    'Distributor',
    'MyContract',
    '_Underscore',
    '$DollarSign',
    'A1B2C3',
    'a',
  ])('accepts valid identifier %s', (name) => {
    const result = validateContractName(name);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(name);
  });

  it('trims surrounding whitespace', () => {
    const result = validateContractName('  TokenAirdrop  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('TokenAirdrop');
  });

  it('rejects empty string', () => {
    const result = validateContractName('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/required/i);
  });

  it('rejects whitespace-only string', () => {
    const result = validateContractName('   ');
    expect(result.ok).toBe(false);
  });

  it.each([
    '1Leading',
    'has space',
    'has-dash',
    'has.dot',
    'has/slash',
    'emoji😀',
  ])('rejects non-identifier %s', (name) => {
    const result = validateContractName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/letter|start|contain/i);
  });

  it('rejects names over 64 characters', () => {
    const result = validateContractName('A'.repeat(65));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/64/);
  });

  it('rejects reserved Solidity keywords', () => {
    const result = validateContractName('contract');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reserved/i);
  });

  it('reserved keyword check is case-insensitive', () => {
    expect(validateContractName('Contract').ok).toBe(false);
    expect(validateContractName('CONTRACT').ok).toBe(false);
  });

  it('exports isValidContractName convenience', () => {
    expect(isValidContractName('TokenAirdrop')).toBe(true);
    expect(isValidContractName('1Bad')).toBe(false);
  });
});
