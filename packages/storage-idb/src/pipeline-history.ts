import type { IDBPDatabase } from 'idb';
import type { PipelineHistoryEntry } from '@titrate/sdk';
import type { TitrateSchema } from './db.js';

export type PipelineHistoryStore = {
  append(campaignId: string, entry: PipelineHistoryEntry): Promise<void>;
  readAll(campaignId: string): Promise<readonly PipelineHistoryEntry[]>;
  count(campaignId: string): Promise<number>;
};

export function createPipelineHistoryStore(
  db: IDBPDatabase<TitrateSchema>,
): PipelineHistoryStore {
  return {
    async append(campaignId, entry) {
      await db.add('pipelineHistory', { campaignId, ...entry } as never);
    },

    async readAll(campaignId) {
      const rows = await db.getAllFromIndex('pipelineHistory', 'byCampaign', campaignId);
      return rows.map((r) => {
        const { campaignId: _c, autoId: _a, ...rest } = r as Record<string, unknown>;
        return rest as unknown as PipelineHistoryEntry;
      });
    },

    async count(campaignId) {
      return db.countFromIndex('pipelineHistory', 'byCampaign', campaignId);
    },
  };
}
