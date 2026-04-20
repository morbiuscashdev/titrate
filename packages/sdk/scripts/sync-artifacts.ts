#!/usr/bin/env node
/**
 * Regenerate packages/sdk/src/distributor/artifacts/{TitrateSimple,TitrateFull}.json
 * from the Foundry build output in packages/contracts/out/.
 *
 * The SDK artifacts ship a subset of the Foundry output: ABI, deploy bytecode,
 * and `rawMetadata` (the Solidity compiler metadata string, required by Sourcify
 * source verification). Anything else the SDK needs at runtime is re-derived.
 *
 * Run after `forge build` whenever the contract sources change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const contractsOut = join(repoRoot, 'packages', 'contracts', 'out');
const sdkArtifacts = join(repoRoot, 'packages', 'sdk', 'src', 'distributor', 'artifacts');

const NAMES = ['TitrateSimple', 'TitrateFull'] as const;

for (const name of NAMES) {
  const foundryPath = join(contractsOut, `${name}.sol`, `${name}.json`);
  const sdkPath = join(sdkArtifacts, `${name}.json`);

  const foundry = JSON.parse(readFileSync(foundryPath, 'utf-8'));
  const bytecode = typeof foundry.bytecode === 'string'
    ? foundry.bytecode
    : foundry.bytecode?.object;
  if (!bytecode) throw new Error(`No bytecode in ${foundryPath}`);
  if (!foundry.rawMetadata) throw new Error(`No rawMetadata in ${foundryPath}`);

  const artifact = {
    contractName: name,
    abi: foundry.abi,
    bytecode,
    rawMetadata: foundry.rawMetadata,
  };

  writeFileSync(sdkPath, `${JSON.stringify(artifact, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`wrote ${sdkPath} (metadata: ${foundry.rawMetadata.length} chars)`);
}
