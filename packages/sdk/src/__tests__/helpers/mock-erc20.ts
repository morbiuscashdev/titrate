import { createRequire } from 'module';
import { type Address, type Hex, encodeAbiParameters, parseAbiParameters } from 'viem';
import { deployContract, type AnvilContext } from './anvil.js';

const require = createRequire(import.meta.url);

// Load the MockERC20 artifact compiled by Foundry (no Transfer events).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockErc20Artifact = require('../../../../../packages/contracts/out/MockERC20.sol/MockERC20.json') as {
  abi: readonly Record<string, unknown>[];
  bytecode: { object: string };
};

// Load the SimpleERC20 artifact (emits Transfer events — required for log scanning tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const simpleErc20Artifact = require('../../../../../packages/contracts/out/SimpleERC20.sol/SimpleERC20.json') as {
  abi: readonly Record<string, unknown>[];
  bytecode: { object: string };
};

export const MOCK_ERC20_ABI = mockErc20Artifact.abi;

export const MOCK_ERC20_ABI_TYPED = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * Deploys the MockERC20 contract (no Transfer event emissions) to Anvil.
 * Use this for testing contract detection (isContract), balances, allowances, etc.
 *
 * @param ctx - The Anvil context
 * @param name - Token name (default: "MockToken")
 * @param symbol - Token symbol (default: "MTK")
 * @param decimals - Token decimals (default: 18)
 * @returns Deployed token address
 */
export async function deployMockERC20(
  ctx: AnvilContext,
  name = 'MockToken',
  symbol = 'MTK',
  decimals = 18,
): Promise<Address> {
  const bytecode = mockErc20Artifact.bytecode.object as Hex;

  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('string, string, uint8'),
    [name, symbol, decimals],
  );
  const deployBytecode = (bytecode + constructorArgs.slice(2)) as Hex;

  return deployContract(ctx, deployBytecode, MOCK_ERC20_ABI);
}

/**
 * Deploys the SimpleERC20 contract (emits Transfer events) to Anvil.
 * Use this for testing `scanTransferEvents` — this contract properly emits
 * ERC-20 Transfer events on mint and transfer calls.
 *
 * @param ctx - The Anvil context
 * @param name - Token name (default: "SimpleToken")
 * @param symbol - Token symbol (default: "STK")
 * @param decimals - Token decimals (default: 18)
 * @returns Deployed token address
 */
export async function deploySimpleERC20(
  ctx: AnvilContext,
  name = 'SimpleToken',
  symbol = 'STK',
  decimals = 18,
): Promise<Address> {
  const bytecode = simpleErc20Artifact.bytecode.object as Hex;

  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('string, string, uint8'),
    [name, symbol, decimals],
  );
  const deployBytecode = (bytecode + constructorArgs.slice(2)) as Hex;

  return deployContract(ctx, deployBytecode, simpleErc20Artifact.abi);
}
