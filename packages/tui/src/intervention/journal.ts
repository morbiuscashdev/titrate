import { appendFile, readFile } from 'node:fs/promises';
import type { InterventionEntry, InterventionJournal } from '@titrate/sdk';

/**
 * Parses a single JSONL line into an InterventionEntry.
 * Returns undefined when the line is empty or unparseable.
 */
function parseLine(line: string): InterventionEntry | undefined {
  const trimmed = line.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed) as InterventionEntry;
  } catch {
    return undefined;
  }
}

/**
 * Reads all lines from a JSONL file and returns parsed entries.
 * Returns an empty array when the file does not exist.
 */
async function readAllEntries(filePath: string): Promise<InterventionEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return raw
    .split('\n')
    .map(parseLine)
    .filter((entry): entry is InterventionEntry => entry !== undefined);
}

/**
 * Creates a file-backed JSONL intervention journal.
 *
 * Each entry is appended as a single JSON line terminated by a newline.
 * The file is created automatically on the first append — no prior setup needed.
 *
 * @param filePath Absolute path to the JSONL journal file.
 * @returns InterventionJournal implementation backed by the file.
 */
export function createFileJournal(filePath: string): InterventionJournal {
  return {
    async append(entry: InterventionEntry): Promise<void> {
      await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');
    },

    async getEntries(campaignId: string): Promise<InterventionEntry[]> {
      const all = await readAllEntries(filePath);
      return all.filter((entry) => entry.campaignId === campaignId);
    },
  };
}
