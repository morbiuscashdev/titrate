#!/usr/bin/env node
import { Command } from 'commander';
import { registerCollect } from './commands/collect.js';
import { registerDeploy } from './commands/deploy.js';
import { registerDeriveWallet } from './commands/derive-wallet.js';
import { registerDistribute } from './commands/distribute.js';
import { registerFilterPreview } from './commands/filter-preview.js';
import { registerRun } from './commands/run.js';
import { registerSetOperations } from './commands/set-operations.js';
import { registerSweep } from './commands/sweep.js';
import { runWizard } from './interactive/wizard.js';

const program = new Command();

program
  .name('titrate')
  .description('CLI for address collection, contract deployment, and token distribution')
  .version('0.0.1');

// Default action: run the interactive wizard when no subcommand is given
program.action(() => {
  runWizard().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
});

registerCollect(program);
registerDeploy(program);
registerDeriveWallet(program);
registerDistribute(program);
registerFilterPreview(program);
registerRun(program);
registerSetOperations(program);
registerSweep(program);

// Explicit `wizard` alias so it can also be invoked as `titrate wizard`
program
  .command('wizard')
  .description('Run the interactive airdrop wizard (default when no subcommand given)')
  .action(() => {
    runWizard().catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
  });

program.parse(process.argv);
