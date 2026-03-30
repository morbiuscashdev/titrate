import { describe, it, expect } from 'vitest';
import { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from '../csv/index.js';

describe('parseCSV', () => {
  it('parses address-only CSV', () => {
    const csv = 'address\n0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.rows[0].amount).toBeNull();
    expect(result.hasAmounts).toBe(false);
  });

  it('parses address+amount CSV', () => {
    const csv = 'address,amount\n0x1234567890abcdef1234567890abcdef12345678,100\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,200';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amount).toBe('100');
    expect(result.rows[1].amount).toBe('200');
    expect(result.hasAmounts).toBe(true);
  });

  it('handles no header row', () => {
    const csv = '0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('trims whitespace', () => {
    const csv = 'address\n  0x1234567890abcdef1234567890abcdef12345678  ';
    const result = parseCSV(csv);
    expect(result.rows[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('returns empty rows for empty content (line 13 early return)', () => {
    const result = parseCSV('');
    expect(result.rows).toHaveLength(0);
    expect(result.hasAmounts).toBe(false);
  });

  it('returns empty rows for whitespace-only content', () => {
    const result = parseCSV('   \n  \n ');
    expect(result.rows).toHaveLength(0);
    expect(result.hasAmounts).toBe(false);
  });

  it('skips lines with invalid addresses (line 24 continue branch)', () => {
    const csv = 'address\nnot-an-address\n0x1234567890abcdef1234567890abcdef12345678';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });
});

describe('detectAmountFormat', () => {
  it('detects integer format', () => {
    expect(detectAmountFormat(['100', '200', '300'])).toBe('integer');
  });
  it('detects decimal format', () => {
    expect(detectAmountFormat(['1.5', '2.0', '3.14'])).toBe('decimal');
  });
  it('detects decimal when mixed', () => {
    expect(detectAmountFormat(['100', '200', '3.5'])).toBe('decimal');
  });
  it('returns integer for empty array', () => {
    expect(detectAmountFormat([])).toBe('integer');
  });
});

describe('validateAddresses', () => {
  it('flags invalid addresses', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: null },
      { address: 'not-an-address' as `0x${string}`, amount: null },
    ];
    const result = validateAddresses(rows);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].index).toBe(1);
  });
});

describe('deduplicateAddresses', () => {
  it('removes duplicate addresses (case-insensitive)', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0x1234567890ABCDEF1234567890ABCDEF12345678' as `0x${string}`, amount: '200' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '300' },
    ];
    const result = deduplicateAddresses(rows);
    expect(result).toHaveLength(2);
  });
  it('keeps first occurrence', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '200' },
    ];
    const result = deduplicateAddresses(rows);
    expect(result[0].amount).toBe('100');
  });
});

describe('flagConflicts', () => {
  it('flags decimal values when format is integer', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '3.5' },
    ];
    const result = flagConflicts(rows, 'integer');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].index).toBe(1);
    expect(result.conflicts[0].reason).toContain('decimal');
  });
  it('returns no conflicts when format matches', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '200' },
    ];
    const result = flagConflicts(rows, 'integer');
    expect(result.conflicts).toHaveLength(0);
  });
  it('skips rows where amount is null', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: null },
    ];
    const result = flagConflicts(rows, 'integer');
    expect(result.conflicts).toHaveLength(0);
  });
  it('flags invalid decimal format when format is decimal (line 21)', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: 'not-a-number' },
    ];
    const result = flagConflicts(rows, 'decimal');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toContain('Invalid decimal format');
  });
  it('accepts valid decimal amounts when format is decimal', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '1.5' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '100' },
    ];
    const result = flagConflicts(rows, 'decimal');
    expect(result.conflicts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseCSV — pathological / hardening tests
// ---------------------------------------------------------------------------

const ADDR1 = '0x1234567890abcdef1234567890abcdef12345678';
const ADDR2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

describe('parseCSV — BOM stripping', () => {
  it('strips UTF-8 BOM from the start of content', () => {
    const csv = `\uFEFFaddress,amount\n${ADDR1},100`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].address).toBe(ADDR1);
    expect(result.rows[0].amount).toBe('100');
  });

  it('parses normally when no BOM is present', () => {
    const csv = `address,amount\n${ADDR1},100`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
  });
});

describe('parseCSV — quoted fields', () => {
  it('strips quotes from a quoted address field', () => {
    const csv = `address,amount\n"${ADDR1}",100`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].address).toBe(ADDR1);
  });

  it('handles embedded comma in a quoted amount field', () => {
    const csv = `address,amount\n"${ADDR1}","1,000"`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe('1,000');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    // RFC 4180: "" inside a quoted field represents a literal "
    const csv = `address,amount\n"${ADDR1}","100""extra"`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe('100"extra');
  });

  it('strips leading/trailing whitespace inside quotes', () => {
    const csv = `address,amount\n"  ${ADDR1}  ",100`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].address).toBe(ADDR1);
  });

  it('strips leading/trailing spaces from amount', () => {
    const csv = `address,amount\n${ADDR1},  200  `;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe('200');
  });
});

describe('parseCSV — comment lines', () => {
  it('skips lines starting with #', () => {
    const csv = `address,amount\n# this is a comment\n${ADDR1},100\n# another comment\n${ADDR2},200`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].address).toBe(ADDR1);
    expect(result.rows[1].address).toBe(ADDR2);
  });

  it('handles CSV with only comments and no data rows', () => {
    const csv = `# comment only\n# another comment`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.hasAmounts).toBe(false);
  });
});

describe('parseCSV — semicolon delimiter', () => {
  it('auto-detects semicolon delimiter', () => {
    const csv = `address;amount\n${ADDR1};100\n${ADDR2};200`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].address).toBe(ADDR1);
    expect(result.rows[0].amount).toBe('100');
    expect(result.hasAmounts).toBe(true);
  });

  it('handles semicolon-only headers', () => {
    const csv = `address;amount\n${ADDR1};50`;
    const result = parseCSV(csv);
    expect(result.rows[0].amount).toBe('50');
  });
});

describe('parseCSV — empty and header-only inputs', () => {
  it('returns empty rows for just whitespace', () => {
    const result = parseCSV('   \n  \n ');
    expect(result.rows).toHaveLength(0);
    expect(result.hasAmounts).toBe(false);
  });

  it('returns empty rows for empty string', () => {
    const result = parseCSV('');
    expect(result.rows).toHaveLength(0);
  });

  it('returns empty rows for CSV with only a header row', () => {
    const result = parseCSV('address,amount');
    expect(result.rows).toHaveLength(0);
    expect(result.hasAmounts).toBe(true);
  });
});

describe('parseCSV — mixed line endings', () => {
  it('handles CRLF line endings', () => {
    const csv = `address,amount\r\n${ADDR1},100\r\n${ADDR2},200`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amount).toBe('100');
  });

  it('handles legacy CR-only line endings', () => {
    const csv = `address,amount\r${ADDR1},100\r${ADDR2},200`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('handles mixed CRLF and LF line endings', () => {
    const csv = `address,amount\r\n${ADDR1},100\n${ADDR2},200`;
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });
});
