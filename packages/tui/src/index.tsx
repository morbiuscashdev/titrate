#!/usr/bin/env bun
import { Command } from 'commander';
import { registerCollect } from './commands/collect.js';
import { registerDeploy } from './commands/deploy.js';
import { registerDeriveWallet } from './commands/derive-wallet.js';
import { registerDistribute } from './commands/distribute.js';
import { registerFilterPreview } from './commands/filter-preview.js';
import { registerRun } from './commands/run.js';
import { registerSetOperations } from './commands/set-operations.js';
import { registerSweep } from './commands/sweep.js';
import { runNewCampaign } from './commands/new-campaign.js';
import { runOpenCampaign } from './commands/open-campaign.js';
import { runListCampaigns } from './commands/list-campaigns.js';

const program = new Command();

program
  .name('titrate')
  .description('Offline-first airdrop platform for EVM chains')
  .version('0.0.1');

program
  .command('new')
  .argument('<name>', 'campaign name')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('Create a new campaign and drop into the interactive dashboard')
  .action(async (name: string, options: { folder?: string }) => {
    await runNewCampaign(name, options);
  });

program
  .command('open')
  .argument('<nameOrPath>', 'campaign name or directory path')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('Open an existing campaign in the interactive dashboard')
  .action(async (nameOrPath: string, options: { folder?: string }) => {
    await runOpenCampaign(nameOrPath, options);
  });

program
  .command('list')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('List campaigns in the campaign root')
  .action(async (options: { folder?: string }) => {
    await runListCampaigns(options);
  });

registerCollect(program);
registerDeploy(program);
registerDeriveWallet(program);
registerDistribute(program);
registerFilterPreview(program);
registerRun(program);
registerSetOperations(program);
registerSweep(program);

program.parseAsync(process.argv);
