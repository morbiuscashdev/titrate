import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const SRC_ENTRY = join(__dirname, '..', 'src', 'index.tsx');
const EXEC_OPTS = { encoding: 'utf-8' as const, timeout: 30_000 };

function runCli(args: string[]): string {
  return execFileSync('bun', ['run', SRC_ENTRY, ...args], EXEC_OPTS);
}

describe('set-ops command', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'titrate-set-ops-'));

  it('computes union of two CSV files', () => {
    const fileA = join(tmpDir, 'a.csv');
    const fileB = join(tmpDir, 'b.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111\n0x2222222222222222222222222222222222222222');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222\n0x3333333333333333333333333333333333333333');

    const output = runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--operation', 'union', '--json']);
    const result = JSON.parse(output);
    expect(result.count).toBe(3);
    expect(result.operation).toBe('union');
  });

  it('computes intersection', () => {
    const fileA = join(tmpDir, 'a2.csv');
    const fileB = join(tmpDir, 'b2.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111\n0x2222222222222222222222222222222222222222');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222\n0x3333333333333333333333333333333333333333');

    const output = runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--operation', 'intersect', '--json']);
    const result = JSON.parse(output);
    expect(result.count).toBe(1);
  });

  it('computes difference', () => {
    const fileA = join(tmpDir, 'a3.csv');
    const fileB = join(tmpDir, 'b3.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111\n0x2222222222222222222222222222222222222222');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222');

    const output = runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--operation', 'difference', '--json']);
    const result = JSON.parse(output);
    expect(result.count).toBe(1);
    expect(result.addresses[0]).toContain('1111');
  });

  it('computes symmetric difference', () => {
    const fileA = join(tmpDir, 'a4.csv');
    const fileB = join(tmpDir, 'b4.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111\n0x2222222222222222222222222222222222222222');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222\n0x3333333333333333333333333333333333333333');

    const output = runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--operation', 'symmetricDifference', '--json']);
    const result = JSON.parse(output);
    expect(result.count).toBe(2);
    expect(result.operation).toBe('symmetricDifference');
  });

  it('outputs CSV by default', () => {
    const fileA = join(tmpDir, 'a5.csv');
    const fileB = join(tmpDir, 'b5.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222');

    const output = runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--operation', 'union']);
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('writes output to file with --output', () => {
    const fileA = join(tmpDir, 'a6.csv');
    const fileB = join(tmpDir, 'b6.csv');
    const outFile = join(tmpDir, 'out.csv');
    writeFileSync(fileA, '0x1111111111111111111111111111111111111111');
    writeFileSync(fileB, '0x2222222222222222222222222222222222222222');

    runCli(['set-ops', '--set-a', fileA, '--set-b', fileB, '--output', outFile]);

    const { readFileSync } = require('node:fs');
    const written = readFileSync(outFile, 'utf-8');
    const lines = written.trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});
