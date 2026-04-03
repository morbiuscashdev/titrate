import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { InterventionEntry } from '@titrate/sdk';
import { createFileJournal } from '../../intervention/journal.js';

const CAMPAIGN_A = 'campaign-alpha';
const CAMPAIGN_B = 'campaign-beta';

function makeEntry(campaignId: string, action: InterventionEntry['action'] = 'approve'): InterventionEntry {
  return {
    timestamp: Date.now(),
    campaignId,
    point: 'batch-preview',
    action,
    issueCount: 0,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'titrate-journal-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('createFileJournal', () => {
  it('appends an entry and retrieves it by campaignId', async () => {
    const filePath = join(tmpDir, 'journal.jsonl');
    const journal = createFileJournal(filePath);
    const entry = makeEntry(CAMPAIGN_A);

    await journal.append(entry);
    const entries = await journal.getEntries(CAMPAIGN_A);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(entry);
  });

  it('filters entries by campaignId', async () => {
    const filePath = join(tmpDir, 'journal.jsonl');
    const journal = createFileJournal(filePath);

    await journal.append(makeEntry(CAMPAIGN_A));
    await journal.append(makeEntry(CAMPAIGN_B));
    await journal.append(makeEntry(CAMPAIGN_A));

    const alphaEntries = await journal.getEntries(CAMPAIGN_A);
    const betaEntries = await journal.getEntries(CAMPAIGN_B);

    expect(alphaEntries).toHaveLength(2);
    expect(betaEntries).toHaveLength(1);
    for (const e of alphaEntries) expect(e.campaignId).toBe(CAMPAIGN_A);
    for (const e of betaEntries) expect(e.campaignId).toBe(CAMPAIGN_B);
  });

  it('creates the file on first append', async () => {
    const filePath = join(tmpDir, 'new-journal.jsonl');
    const journal = createFileJournal(filePath);

    // File must not exist yet — we use a fresh path inside the temp dir
    await journal.append(makeEntry(CAMPAIGN_A));
    const entries = await journal.getEntries(CAMPAIGN_A);
    expect(entries).toHaveLength(1);
  });

  it('returns an empty array for a non-existent file', async () => {
    const filePath = join(tmpDir, 'does-not-exist.jsonl');
    const journal = createFileJournal(filePath);

    const entries = await journal.getEntries(CAMPAIGN_A);
    expect(entries).toEqual([]);
  });

  it('returns an empty array when campaignId has no matching entries', async () => {
    const filePath = join(tmpDir, 'journal.jsonl');
    const journal = createFileJournal(filePath);

    await journal.append(makeEntry(CAMPAIGN_A));
    const entries = await journal.getEntries(CAMPAIGN_B);

    expect(entries).toEqual([]);
  });

  it('preserves all entry fields through a round-trip', async () => {
    const filePath = join(tmpDir, 'journal.jsonl');
    const journal = createFileJournal(filePath);
    const entry: InterventionEntry = {
      timestamp: 1743600000000,
      campaignId: CAMPAIGN_A,
      point: 'validation-error',
      action: 'abort',
      issueCount: 3,
    };

    await journal.append(entry);
    const entries = await journal.getEntries(CAMPAIGN_A);

    expect(entries[0]).toEqual(entry);
  });

  it('accumulates entries across multiple journal instances pointing to the same file', async () => {
    const filePath = join(tmpDir, 'shared.jsonl');

    const journal1 = createFileJournal(filePath);
    await journal1.append(makeEntry(CAMPAIGN_A));

    const journal2 = createFileJournal(filePath);
    await journal2.append(makeEntry(CAMPAIGN_A));

    const entries = await journal2.getEntries(CAMPAIGN_A);
    expect(entries).toHaveLength(2);
  });
});
