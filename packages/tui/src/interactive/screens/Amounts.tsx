import { useState, useReducer } from 'react';
import { useKeyboard } from '@opentui/react';
import type { SelectOption } from '@opentui/core';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

type State = {
  readonly mode: 'uniform' | 'variable';
  readonly uniformAmount: string;
};

type Action =
  | { readonly type: 'setMode'; readonly mode: 'uniform' | 'variable' }
  | { readonly type: 'setAmount'; readonly value: string };

function reducer(state: State, action: Action): State {
  if (action.type === 'setMode') return { ...state, mode: action.mode };
  if (action.type === 'setAmount') return { ...state, uniformAmount: action.value };
  return state;
}

export function Amounts({ onDone, onBack }: StepProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const [state, dispatch] = useReducer(reducer, {
    mode: manifest.amountMode,
    uniformAmount: manifest.uniformAmount ?? '',
  });
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return' && state.mode === 'uniform' && state.uniformAmount) {
      await storage.manifest.update({
        amountMode: 'uniform',
        uniformAmount: state.uniformAmount,
      });
      await refresh();
      setMessage('Saved');
      setTimeout(onDone, 300);
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 4 — Amounts</strong></text>
      <box marginTop={1}>
        <text>Mode:</text>
        <select
          focused
          options={[
            { name: 'Uniform (same amount per recipient)', description: '', value: 'uniform' },
            { name: 'Variable (per-recipient amounts.csv)', description: '', value: 'variable' },
          ]}
          onChange={(_i: number, option: SelectOption | null) => {
            if (option) dispatch({ type: 'setMode', mode: option.value as 'uniform' | 'variable' });
          }}
        />
      </box>
      {state.mode === 'uniform' && (
        <box marginTop={1} flexDirection="column">
          <text>Amount (integer token base units):</text>
          <input
            focused
            value={state.uniformAmount}
            onChange={(v: string) => dispatch({ type: 'setAmount', value: v })}
            placeholder="1000000000000000000"
          />
        </box>
      )}
      {message && <text><span fg="green">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: save · Esc: back</span></text>
      </box>
    </box>
  );
}
