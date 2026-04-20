import {
  loadOrCreateTestnetKey,
  readTestnetKey,
  TESTNET_KEY_PATH,
} from '../src/__tests__/helpers/testnet-key-store.js';

/**
 * Generates (or reads back) the persistent PulseChain v4 testnet account used
 * by the gated E2E tests. Prints the address so it can be funded manually.
 *
 * Run from packages/sdk:
 *   npx tsx scripts/gen-testnet-key.ts
 */
function main(): void {
  const existed = readTestnetKey() !== null;
  const key = loadOrCreateTestnetKey();

  if (existed) {
    console.log(`Existing testnet key at ${TESTNET_KEY_PATH}`);
  } else {
    console.log(`Generated new testnet key at ${TESTNET_KEY_PATH}`);
  }

  console.log('');
  console.log(`Address:     ${key.address}`);
  console.log(`Created at:  ${key.createdAt}`);
  console.log('');
  console.log('Fund this address via:');
  console.log('  1. https://faucet.v4.testnet.pulsechain.com/ (10 tPLS / 24h)');
  console.log('  2. Direct transfer from any tPLS account');
  console.log('');
  console.log('The mnemonic lives in the gitignored key file — treat it as a secret.');
}

main();
