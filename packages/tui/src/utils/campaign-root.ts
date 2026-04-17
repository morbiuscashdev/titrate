import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CampaignRootOptions = {
  readonly folder?: string;
  readonly cwd?: string;
};

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, '.git'));
    return s.isDirectory() || s.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve the campaign root directory. Priority:
 *   1. explicit --folder flag
 *   2. TITRATE_CAMPAIGNS_DIR environment variable
 *   3. auto-detect: ./titrate-campaigns/ if in a git repo, else ~/.titrate-campaigns/
 */
export async function resolveCampaignRoot(options: CampaignRootOptions): Promise<string> {
  if (options.folder) return options.folder;
  const env = process.env.TITRATE_CAMPAIGNS_DIR;
  if (env) return env;
  const cwd = options.cwd ?? process.cwd();
  if (await isGitRepo(cwd)) {
    return join(cwd, 'titrate-campaigns');
  }
  return join(homedir(), '.titrate-campaigns');
}
