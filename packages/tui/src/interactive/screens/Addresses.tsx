import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { readFile } from 'node:fs/promises';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

export function Addresses({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { refresh } = useManifest();
  const [csvPath, setCsvPath] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return' && csvPath) importCsv();
  });

  async function importCsv() {
    setStatus('loading');
    try {
      await storage.ensureDir();
      const raw = await readFile(csvPath, 'utf8');
      const rows = raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [address, amount] = line.split(',');
          return { address: address.trim(), amount: amount?.trim() || null };
        });
      await storage.addresses.append(rows);
      await refresh();
      setStatus('success');
      setMessage(`${rows.length} addresses imported`);
    } catch (err) {
      setStatus('error');
      setMessage(String(err));
    }
  }

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 2 — Addresses</strong></text>
      <box marginTop={1} flexDirection="column">
        <text>Import from CSV path:</text>
        <input
          focused
          value={csvPath}
          onChange={setCsvPath}
          placeholder="/path/to/addresses.csv"
        />
      </box>
      {status === 'loading' && <text><span fg="gray">Loading…</span></text>}
      {status === 'success' && <text><span fg="green">{message}</span></text>}
      {status === 'error' && <text><span fg="red">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: import · Esc: back</span></text>
      </box>
      <box marginTop={1}>
        <text onMouseDown={onDone}>
          <span fg="cyan">[ Done ]</span>
        </text>
      </box>
    </box>
  );
}
