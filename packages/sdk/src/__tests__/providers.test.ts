import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  getProvider,
  resolveRpcUrl,
  splitTemplate,
} from '../chains/providers.js';

describe('PROVIDERS catalog', () => {
  it('exposes valve, alchemy, infura, public, custom', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain('valve');
    expect(ids).toContain('alchemy');
    expect(ids).toContain('infura');
    expect(ids).toContain('public');
    expect(ids).toContain('custom');
  });
});

describe('valve.city URL builder', () => {
  it('uses chainId directly in subdomain', () => {
    const valve = getProvider('valve');
    expect(valve.buildUrl(369, 'vk_demo')).toBe('https://evm369.rpc.valve.city/v1/vk_demo');
    expect(valve.buildUrl(1, 'vk_abc')).toBe('https://evm1.rpc.valve.city/v1/vk_abc');
  });

  it('supports any EVM chain', () => {
    const valve = getProvider('valve');
    expect(valve.buildUrl(42161, 'key')).toBe('https://evm42161.rpc.valve.city/v1/key');
    expect(valve.buildUrl(8453, 'key')).toBe('https://evm8453.rpc.valve.city/v1/key');
  });
});

describe('alchemy URL builder', () => {
  it('returns slug-based URL for supported chains', () => {
    const alchemy = getProvider('alchemy');
    expect(alchemy.buildUrl(1, 'k')).toBe('https://eth-mainnet.g.alchemy.com/v2/k');
  });

  it('returns null for unsupported chains', () => {
    const alchemy = getProvider('alchemy');
    expect(alchemy.buildUrl(369, 'k')).toBeNull();
  });
});

describe('resolveRpcUrl', () => {
  it('prefers valve key when set', () => {
    const url = resolveRpcUrl(1, { providerKeys: { valve: 'vk_1' } }, ['https://public.example/rpc']);
    expect(url).toBe('https://evm1.rpc.valve.city/v1/vk_1');
  });

  it('falls back to alchemy if no valve key', () => {
    const url = resolveRpcUrl(1, { providerKeys: { alchemy: 'ak_1' } }, ['https://public.example/rpc']);
    expect(url).toBe('https://eth-mainnet.g.alchemy.com/v2/ak_1');
  });

  it('falls back to public rpc when no provider keys match', () => {
    const url = resolveRpcUrl(369, { providerKeys: { alchemy: 'ak_1' } }, ['https://rpc.pulsechain.com']);
    expect(url).toBe('https://rpc.pulsechain.com');
  });
});

describe('splitTemplate', () => {
  it('splits valve template into prefix + suffix', () => {
    const { prefix, suffix } = splitTemplate('valve', 369);
    expect(prefix).toBe('https://evm369.rpc.valve.city/v1/');
    expect(suffix).toBe('');
  });

  it('splits alchemy template into prefix + suffix', () => {
    const { prefix, suffix } = splitTemplate('alchemy', 1);
    expect(prefix).toBe('https://eth-mainnet.g.alchemy.com/v2/');
    expect(suffix).toBe('');
  });
});
