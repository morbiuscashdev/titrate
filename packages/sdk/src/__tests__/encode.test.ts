import { describe, it, expect } from 'vitest';
import { encode } from '../encode/index.js';
import { decodeFunctionData, parseAbi } from 'viem';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

describe('encode', () => {
  const alice = '0x1234567890abcdef1234567890abcdef12345678' as const;
  const token = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
  const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as const;

  describe('transfer', () => {
    it('encodes an ERC-20 transfer call', () => {
      const result = encode.transfer(token, alice, 100n);
      expect(result.target).toBe(token);
      expect(result.value).toBe(0n);
      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: result.data });
      expect(decoded.functionName).toBe('transfer');
      expect(decoded.args[0].toLowerCase()).toBe(alice);
      expect(decoded.args[1]).toBe(100n);
    });
  });

  describe('nativeTransfer', () => {
    it('returns empty calldata with zero value', () => {
      const result = encode.nativeTransfer(alice);
      expect(result.target).toBe(alice);
      expect(result.data).toBe('0x');
      expect(result.value).toBe(0n);
    });
  });

  describe('swap', () => {
    it('encodes a V2 swapExactTokensForTokens call', () => {
      const tokenOut = '0x2222222222222222222222222222222222222222' as const;
      const result = encode.swap(router, token, tokenOut, 1000n, 900n, alice);
      expect(result.target).toBe(router);
      expect(result.value).toBe(0n);
      expect(result.data.length).toBeGreaterThan(10);
    });
  });

  describe('raw', () => {
    it('encodes arbitrary function calls', () => {
      const abi = parseAbi(['function foo(uint256 x) returns (uint256)']);
      const result = encode.raw(token, abi, 'foo', [42n]);
      expect(result.target).toBe(token);
      expect(result.data.length).toBeGreaterThan(10);
    });
  });
});
