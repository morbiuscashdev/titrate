import { appendFile, stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type AppendableJSONL<T> = {
  readonly append: (records: readonly T[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<T>;
  readonly readAll: () => Promise<readonly T[]>;
  readonly count: () => Promise<number>;
};

/**
 * Append-only JSONL file. Each record is serialized as a single-line JSON
 * record followed by \n. Consumers are expected to handle BigInt
 * serialization before passing records in (BigInts are not JSON-safe).
 */
export function createAppendableJSONL<T>(path: string): AppendableJSONL<T> {
  return {
    async append(records) {
      if (records.length === 0) return;
      const buf = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
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
    async readAll() {
      const out: T[] = [];
      for await (const r of this.readFrom(0)) out.push(r);
      return out;
    },
    readFrom(lineOffset) {
      async function* gen(): AsyncIterable<T> {
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
            yield JSON.parse(line) as T;
          }
          i++;
        }
      }
      return gen();
    },
  };
}
