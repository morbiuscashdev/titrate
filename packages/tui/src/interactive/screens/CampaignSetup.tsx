import { useReducer, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { getChains, probeToken } from '@titrate/sdk';
import type { SelectOption } from '@opentui/core';
import { useCampaignStorage, useManifest, useClient } from '../context.js';
import type { StepProps } from '../App.js';

type Field = 'chain' | 'tokenAddress' | 'batchSize';

type State = {
  readonly focus: Field;
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly batchSize: number;
  readonly probeStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly probedSymbol: string;
  readonly probedDecimals: number;
  readonly error: string | null;
};

type Action =
  | { readonly type: 'focus'; readonly field: Field }
  | { readonly type: 'setChain'; readonly chainId: number }
  | { readonly type: 'setTokenAddress'; readonly value: string }
  | { readonly type: 'setBatchSize'; readonly value: number }
  | { readonly type: 'probeStart' }
  | { readonly type: 'probeSuccess'; readonly symbol: string; readonly decimals: number }
  | { readonly type: 'probeError'; readonly message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'focus': return { ...state, focus: action.field };
    case 'setChain': return { ...state, chainId: action.chainId };
    case 'setTokenAddress': return { ...state, tokenAddress: action.value };
    case 'setBatchSize': return { ...state, batchSize: action.value };
    case 'probeStart': return { ...state, probeStatus: 'loading', error: null };
    case 'probeSuccess': return { ...state, probeStatus: 'success', probedSymbol: action.symbol, probedDecimals: action.decimals };
    case 'probeError': return { ...state, probeStatus: 'error', error: action.message };
  }
}

export function CampaignSetup({ onDone, onBack }: StepProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const client = useClient();

  const [state, dispatch] = useReducer(reducer, {
    focus: 'chain',
    chainId: manifest.chainId,
    tokenAddress: manifest.tokenAddress,
    batchSize: manifest.batchSize,
    probeStatus: 'idle',
    probedSymbol: manifest.contractName,
    probedDecimals: manifest.tokenDecimals,
    error: null,
  });

  const chains = [
    ...getChains('mainnet'),
    ...getChains('testnet'),
  ];

  const chainOptions: SelectOption[] = chains.map((c) => ({
    name: c.name,
    description: `Chain ID: ${c.chainId}`,
    value: c.chainId,
  }));

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'tab') {
      const fields: Field[] = ['chain', 'tokenAddress', 'batchSize'];
      const i = fields.indexOf(state.focus);
      dispatch({ type: 'focus', field: fields[(i + 1) % fields.length] });
    }
    if (key.name === 'return' && state.probeStatus === 'success') {
      save();
    }
  });

  async function save() {
    await storage.manifest.update({
      chainId: state.chainId,
      tokenAddress: state.tokenAddress as `0x${string}`,
      tokenDecimals: state.probedDecimals,
      contractName: state.probedSymbol,
      batchSize: state.batchSize,
    });
    await refresh();
    onDone();
  }

  // Auto-probe token on address change when client is ready
  useEffect(() => {
    if (!client) return;
    if (state.tokenAddress.length !== 42) return;

    dispatch({ type: 'probeStart' });

    probeToken(client, state.tokenAddress as `0x${string}`).then(
      (res) => {
        if (res) {
          dispatch({ type: 'probeSuccess', symbol: res.symbol, decimals: res.decimals });
        } else {
          dispatch({ type: 'probeError', message: 'Not a valid ERC-20 token' });
        }
      },
      (err: unknown) => dispatch({ type: 'probeError', message: String(err) }),
    );
  }, [client, state.chainId, state.tokenAddress]);

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 1 — Campaign Setup</strong></text>
      <box marginTop={1} flexDirection="column">
        <text>Chain:</text>
        <select
          focused={state.focus === 'chain'}
          options={chainOptions}
          onChange={(_index: number, option: SelectOption | null) => {
            if (option?.value != null) {
              dispatch({ type: 'setChain', chainId: Number(option.value) });
            }
          }}
        />
      </box>
      <box marginTop={1} flexDirection="column">
        <text>Token address:</text>
        <input
          focused={state.focus === 'tokenAddress'}
          value={state.tokenAddress}
          onChange={(v: string) => dispatch({ type: 'setTokenAddress', value: v })}
          placeholder="0x…"
        />
        {state.probeStatus === 'loading' && <text><span fg="gray">Probing…</span></text>}
        {state.probeStatus === 'success' && (
          <text>
            <span fg="green">✓ {state.probedSymbol} ({state.probedDecimals} decimals)</span>
          </text>
        )}
        {state.probeStatus === 'error' && (
          <text><span fg="red">{state.error}</span></text>
        )}
      </box>
      <box marginTop={1} flexDirection="column">
        <text>Batch size:</text>
        <input
          focused={state.focus === 'batchSize'}
          value={String(state.batchSize)}
          onChange={(v: string) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n > 0) dispatch({ type: 'setBatchSize', value: n });
          }}
          placeholder="200"
        />
      </box>
      <box marginTop={1}>
        <text>
          <span fg="gray">Tab: next field · Enter: save (when probe succeeds) · Esc: back</span>
        </text>
      </box>
    </box>
  );
}
