import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import type { Address } from 'viem';
import { parseCSV, union, intersect, difference, symmetricDifference } from '@titrate/sdk';

type SetOp = 'union' | 'intersect' | 'difference' | 'symmetricDifference';

const OPERATIONS: Record<SetOp, (a: Address[], b: Address[]) => Address[]> = {
  union: (a, b) => union(a, b),
  intersect: (a, b) => intersect(a, b),
  difference,
  symmetricDifference,
};

/**
 * Registers the `set-ops` subcommand on a Commander program.
 *
 * Combines two address lists using a set operation (union, intersect,
 * difference, symmetricDifference) and writes the result to stdout or a file.
 */
export function registerSetOperations(program: Command): void {
  program
    .command('set-ops')
    .description('Combine two address lists using set operations (union, intersect, difference)')
    .requiredOption('--set-a <path>', 'CSV file for set A')
    .requiredOption('--set-b <path>', 'CSV file for set B')
    .option('--operation <op>', 'Operation: union, intersect, difference, symmetricDifference', 'union')
    .option('--output <path>', 'Output CSV path (omit for stdout)')
    .option('--json', 'Output as JSON instead of CSV')
    .action(async (opts: {
      setA: string;
      setB: string;
      operation: string;
      output?: string;
      json?: boolean;
    }) => {
      const op = opts.operation as SetOp;
      if (!OPERATIONS[op]) {
        console.error(`Unknown operation: ${op}. Use: union, intersect, difference, symmetricDifference`);
        process.exit(1);
      }

      const csvA = readFileSync(opts.setA, 'utf-8');
      const csvB = readFileSync(opts.setB, 'utf-8');
      const rowsA = parseCSV(csvA).rows;
      const rowsB = parseCSV(csvB).rows;

      const addressesA = rowsA.map((r) => r.address);
      const addressesB = rowsB.map((r) => r.address);

      const result = OPERATIONS[op](addressesA, addressesB);

      console.error(`Set A: ${addressesA.length} addresses`);
      console.error(`Set B: ${addressesB.length} addresses`);
      console.error(`${op}: ${result.length} addresses`);

      if (opts.json) {
        const output = JSON.stringify({ operation: op, count: result.length, addresses: result }, null, 2);
        if (opts.output) {
          writeFileSync(opts.output, output);
          console.error(`Written to ${opts.output}`);
        } else {
          console.log(output);
        }
      } else {
        const csv = result.join('\n');
        if (opts.output) {
          writeFileSync(opts.output, csv);
          console.error(`Written to ${opts.output}`);
        } else {
          console.log(csv);
        }
      }
    });
}
