import { readFile, writeFile } from 'node:fs/promises';
import type { PipelineConfig } from '@titrate/sdk';

export type PipelineStore = {
  readonly read: () => Promise<PipelineConfig>;
  readonly write: (pipeline: PipelineConfig) => Promise<void>;
};

export function createPipelineStore(path: string): PipelineStore {
  return {
    async read() {
      try {
        const raw = await readFile(path, 'utf8');
        return JSON.parse(raw) as PipelineConfig;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { steps: [] };
        throw err;
      }
    },

    async write(pipeline) {
      await writeFile(path, JSON.stringify(pipeline, null, 2), 'utf8');
    },
  };
}
