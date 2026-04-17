import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { StepProps } from '../App.js';

export function Distribute({ onBack }: StepProps) {
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'd') {
      setMessage('Distribution wiring lands in Phase 1d (run titrate distribute --campaign <name>)');
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 6 — Distribute</strong></text>
      <text>
        <span fg="gray">Invoke the distributor via the scripted command: titrate distribute --campaign {'<name>'}</span>
      </text>
      {message && <text><span fg="yellow">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">d: show run instructions · Esc: back</span></text>
      </box>
    </box>
  );
}
