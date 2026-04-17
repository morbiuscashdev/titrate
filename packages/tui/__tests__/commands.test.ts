import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RPC_URL = 'http://127.0.0.1:8545';

async function checkAnvilUp(): Promise<boolean> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const anvilReady = await checkAnvilUp();

const ANVIL_ADDR_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ANVIL_ADDR_2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ZERO_TOKEN = '0x0000000000000000000000000000000000000000';
const SRC_ENTRY = join(__dirname, '..', 'src', 'index.tsx');
const EXEC_OPTS = { encoding: 'utf-8' as const, timeout: 30_000 };

/**
 * Spawns `bun run src/index.tsx` with the given args and returns stdout.
 * stderr is inherited so test output shows progress/errors.
 */
function runCli(args: string[]): string {
  return execFileSync('bun', ['run', SRC_ENTRY, ...args], EXEC_OPTS);
}

describe('titrate CLI e2e', () => {
  it('--help shows all commands', () => {
    const output = runCli(['--help']);
    expect(output).toContain('collect');
    expect(output).toContain('deploy');
    expect(output).toContain('distribute');
    expect(output).toContain('derive-wallet');
    expect(output).toContain('run');
  });

  if (anvilReady) describe('deploy', () => {
    it('deploys a simple contract and returns valid JSON with an address', () => {
      const raw = runCli([
        'deploy',
        '--name', 'TestE2E',
        '--rpc', RPC_URL,
        '--variant', 'simple',
        '--private-key', PRIVATE_KEY,
      ]);
      const result = JSON.parse(raw) as Record<string, unknown>;
      expect(result).toHaveProperty('address');
      expect(typeof result.address).toBe('string');
      expect((result.address as string)).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.variant).toBe('simple');
    });
  });

  describe('derive-wallet', () => {
    const deriveArgs = [
      'derive-wallet',
      '--cold-key', PRIVATE_KEY,
      '--funder', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '--name', 'Test Campaign',
    ];

    it('outputs JSON with hotAddress and privateKey', () => {
      const raw = runCli(deriveArgs);
      const result = JSON.parse(raw) as Record<string, unknown>;
      expect(result).toHaveProperty('hotAddress');
      expect(result).toHaveProperty('privateKey');
      expect((result.hotAddress as string)).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect((result.privateKey as string)).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('is deterministic — two invocations produce the same hotAddress', () => {
      const first = JSON.parse(runCli(deriveArgs)) as { hotAddress: string };
      const second = JSON.parse(runCli(deriveArgs)) as { hotAddress: string };
      expect(first.hotAddress).toBe(second.hotAddress);
    });
  });

  if (anvilReady) describe('deploy + distribute', () => {
    it('distributes 0.001 ETH to two Anvil addresses', () => {
      // Step 1: deploy
      const deployRaw = runCli([
        'deploy',
        '--name', 'TestE2EDistribute',
        '--rpc', RPC_URL,
        '--variant', 'simple',
        '--private-key', PRIVATE_KEY,
      ]);
      const deployResult = JSON.parse(deployRaw) as { address: string };
      const contractAddress = deployResult.address;
      expect(contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

      // Step 2: write a temp CSV with recipient addresses
      const csvPath = join(tmpdir(), `titrate-e2e-${Date.now()}.csv`);
      writeFileSync(csvPath, `${ANVIL_ADDR_1}\n${ANVIL_ADDR_2}\n`, 'utf-8');

      try {
        // Step 3: distribute — 0.001 ETH = 1_000_000_000_000_000 wei
        const distributeRaw = runCli([
          'distribute',
          '--contract', contractAddress,
          '--token', ZERO_TOKEN,
          '--rpc', RPC_URL,
          '--addresses', csvPath,
          '--amount', '1000000000000000',
          '--variant', 'simple',
          '--private-key', PRIVATE_KEY,
        ]);

        const results = JSON.parse(distributeRaw) as Array<{
          batchIndex: number;
          recipients: string[];
          amounts: string[];
          confirmedTxHash: string | null;
        }>;

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        const batch = results[0];
        expect(batch.batchIndex).toBe(0);
        expect(batch.recipients).toHaveLength(2);
        // Viem lowercases addresses in receipts
        expect(batch.recipients).toContain(ANVIL_ADDR_1.toLowerCase());
        expect(batch.recipients).toContain(ANVIL_ADDR_2.toLowerCase());
        expect(batch.amounts).toHaveLength(2);
        batch.amounts.forEach((amt) => expect(amt).toBe('1000000000000000'));
        expect(batch.confirmedTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      } finally {
        unlinkSync(csvPath);
      }
    });
  });
});
