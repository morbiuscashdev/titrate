import type { Address } from 'viem';

export type WalletSelectInput = {
  readonly wallets: readonly Address[];
  readonly lastIndex: number;
  readonly balances: ReadonlyMap<Address, bigint>;
  readonly minBalance: bigint;
};

export type WalletSelectResult = {
  readonly address: Address;
  readonly index: number;
};

export function selectWallet(input: WalletSelectInput): WalletSelectResult | null {
  const { wallets, lastIndex, balances, minBalance } = input;
  if (wallets.length === 0) return null;

  for (let offset = 1; offset <= wallets.length; offset++) {
    const idx = (lastIndex + offset + wallets.length) % wallets.length;
    const addr = wallets[idx];
    const bal = balances.get(addr) ?? 0n;
    if (bal >= minBalance) return { address: addr, index: idx };
  }
  return null;
}
