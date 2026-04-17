import { appendFile, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type CSVRow = {
  readonly address: string;
  readonly amount: string | null;
};

export type AppendableCSV = {
  readonly append: (rows: readonly CSVRow[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<CSVRow>;
  readonly count: () => Promise<number>;
};

function rowToLine(row: CSVRow): string {
  return `${row.address},${row.amount ?? ''}`;
}

function parseLine(line: string): CSVRow {
  const commaIdx = line.indexOf(',');
  if (commaIdx === -1) {
    return { address: line, amount: null };
  }
  const address = line.slice(0, commaIdx);
  const amount = line.slice(commaIdx + 1);
  return { address, amount: amount === '' ? null : amount };
}

/**
 * Append-only CSV file optimized for streaming. No header row; each line is
 * `<address>,<amount?>`. Safe to call append() concurrently — node's
 * fs.appendFile is atomic on POSIX.
 */
export function createAppendableCSV(path: string): AppendableCSV {
  return {
    async append(rows) {
      if (rows.length === 0) return;
      const buf = rows.map(rowToLine).join('\n') + '\n';
      await appendFile(path, buf, 'utf8');
    },
    async count() {
      try {
        const s = await stat(path);
        if (s.size === 0) return 0;
        const data = await readFile(path, 'utf8');
        let n = 0;
        for (let i = 0; i < data.length; i++) {
          if (data.charCodeAt(i) === 10) n++;
        }
        return n;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw err;
      }
    },
    readFrom(lineOffset) {
      async function* gen(): AsyncIterable<CSVRow> {
        try {
          await stat(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw err;
        }
        const stream = createReadStream(path, { encoding: 'utf8' });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });
        let i = 0;
        for await (const line of rl) {
          if (i >= lineOffset && line.length > 0) {
            yield parseLine(line);
          }
          i++;
        }
      }
      return gen();
    },
  };
}
