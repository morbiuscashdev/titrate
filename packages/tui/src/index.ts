#!/usr/bin/env node
import { Command } from 'commander';
import { registerCollect } from './commands/collect.js';
import { registerDeploy } from './commands/deploy.js';
import { registerDeriveWallet } from './commands/derive-wallet.js';

const program = new Command();

program
  .name('titrate')
  .description('CLI for address collection, contract deployment, and token distribution')
  .version('0.0.1');

registerCollect(program);
registerDeploy(program);
registerDeriveWallet(program);

program.parse(process.argv);
