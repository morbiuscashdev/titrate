import type { Address, Hex, Abi } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';
import type { CallData } from '../types.js';

const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const UNISWAP_V2_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]);

function transfer(token: Address, to: Address, amount: bigint): CallData {
  return {
    target: token,
    data: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, amount] }),
    value: 0n,
  };
}

function nativeTransfer(to: Address): CallData {
  return { target: to, data: '0x', value: 0n };
}

function swap(
  router: Address, tokenIn: Address, tokenOut: Address,
  amountIn: bigint, amountOutMin: bigint, to: Address,
): CallData {
  return {
    target: router,
    data: encodeFunctionData({
      abi: UNISWAP_V2_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, [tokenIn, tokenOut], to, BigInt(Math.floor(Date.now() / 1000) + 1200)],
    }),
    value: 0n,
  };
}

function raw(target: Address, abi: Abi, functionName: string, args: readonly unknown[]): CallData {
  return {
    target,
    data: encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]),
    value: 0n,
  };
}

export const encode = { transfer, nativeTransfer, swap, raw } as const;
