import type { IDBPDatabase } from 'idb';
import type { LoopErrorEntry } from '@titrate/sdk';
import type { TitrateSchema } from './db.js';

export type ErrorsStore = {
  append(campaignId: string, entry: LoopErrorEntry): Promise<void>;
  readAll(campaignId: string): Promise<readonly LoopErrorEntry[]>;
};

export function createErrorsStore(db: IDBPDatabase<TitrateSchema>): ErrorsStore {
  return {
    async append(campaignId, entry) {
      await db.add('errors', { campaignId, ...entry } as never);
    },
    async readAll(campaignId) {
      const rows = await db.getAllFromIndex('errors', 'byCampaign', campaignId);
      return rows.map((r) => {
        const { campaignId: _c, autoId: _a, ...rest } = r as Record<string, unknown>;
        return rest as unknown as LoopErrorEntry;
      });
    },
  };
}
