import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCampaignRoot } from '../src/utils/campaign-root.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-root-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('--folder flag takes precedence', async () => {
  const root = await resolveCampaignRoot({ folder: dir });
  expect(root).toBe(dir);
});

test('TITRATE_CAMPAIGNS_DIR env var is used when no flag', async () => {
  process.env.TITRATE_CAMPAIGNS_DIR = dir;
  const root = await resolveCampaignRoot({});
  expect(root).toBe(dir);
  delete process.env.TITRATE_CAMPAIGNS_DIR;
});

test('auto-detect prefers ./titrate-campaigns when in a git repo', async () => {
  delete process.env.TITRATE_CAMPAIGNS_DIR;
  await mkdir(join(dir, '.git'), { recursive: true });
  const root = await resolveCampaignRoot({ cwd: dir });
  expect(root).toBe(join(dir, 'titrate-campaigns'));
});

test('auto-detect falls back to ~/.titrate-campaigns when not in a repo', async () => {
  delete process.env.TITRATE_CAMPAIGNS_DIR;
  const root = await resolveCampaignRoot({ cwd: dir });
  expect(root).toBe(join(homedir(), '.titrate-campaigns'));
});
