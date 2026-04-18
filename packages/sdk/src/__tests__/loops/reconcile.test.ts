import { describe, it, expect, vi } from 'vitest';
import { reconcileBatches } from '../../pipeline/loops/reconcile.js';
import type { BatchRecord, BatchAttemptRecord } from '../../index.js';
import type { Address, Hex, PublicClient } from 'viem';

const WALLET = '0xabcdef0123456789abcdef0123456789abcdef01' as Address;

function batch(overrides: Partial<BatchRecord> = {}): BatchRecord {
  const attempt: BatchAttemptRecord = {
    txHash: '0xaa' as Hex,
    nonce: 5,
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '500000000',
    broadcastAt: 0,
    outcome: 'pending',
    confirmedBlock: null,
  };
  return {
    batchIndex: 0,
    recipients: ['0x1' as Address],
    amounts: ['1'],
    status: 'broadcast',
    attempts: [attempt],
    confirmedTxHash: null,
    confirmedBlock: null,
    createdAt: 0,
    ...overrides,
  };
}

function makeClient(handlers: Partial<PublicClient>): PublicClient {
  return handlers as unknown as PublicClient;
}

describe('reconcileBatches', () => {
  it('classifies a confirmed tx as confirmed', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 100n }),
      }),
      batches: [batch()],
      walletAddress: WALLET,
    });
    expect(decisions[0].kind).toBe('confirmed');
    if (decisions[0].kind === 'confirmed') {
      expect(decisions[0].batchIndex).toBe(0);
      expect(decisions[0].blockNumber).toBe(100n);
    }
  });

  it('classifies a reverted tx as intervention-reverted', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'reverted', blockNumber: 100n }),
      }),
      batches: [batch()],
      walletAddress: WALLET,
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-reverted');
    }
  });

  it('classifies a pending-in-mempool tx as pending', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
        getTransaction: vi.fn().mockResolvedValue({ hash: '0xaa', nonce: 5 }),
        getTransactionCount: vi.fn().mockResolvedValue(5),
      }),
      batches: [batch()],
      walletAddress: WALLET,
    });
    expect(decisions[0].kind).toBe('pending');
  });

  it('classifies a dropped tx (nonce advanced, no tx) as intervention-dropped', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
        getTransaction: vi.fn().mockResolvedValue(null),
        getTransactionCount: vi.fn().mockResolvedValue(6),
      }),
      batches: [batch()],
      walletAddress: WALLET,
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-dropped');
    }
  });

  it('classifies an externally-replaced tx as intervention-replaced-externally', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
        getTransaction: vi.fn().mockResolvedValue(null),
        getTransactionCount: vi.fn().mockResolvedValue(6),
      }),
      batches: [batch()],
      walletAddress: WALLET,
      externalReplacementDetector: async () => ({ detected: true, replacementTxHash: '0xbb' as Hex }),
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-replaced-externally');
    }
  });

  it('classifies RPC failure as intervention-state-unknown', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockRejectedValue(new Error('network down')),
      }),
      batches: [batch()],
      walletAddress: WALLET,
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-state-unknown');
    }
  });

  it('ignores non-broadcast batches', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({}),
      batches: [batch({ status: 'confirmed' })],
      walletAddress: WALLET,
    });
    expect(decisions.length).toBe(0);
  });
});
