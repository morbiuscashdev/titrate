import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

export function Filters({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { refresh } = useManifest();
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 's') {
      await storage.pipeline.write({ steps: [] });
      await refresh();
      setMessage('Pipeline saved (no filters)');
      setTimeout(onDone, 500);
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 3 — Filters</strong></text>
      <text>
        <span fg="gray">Filter configuration lands later. For now, press s to skip.</span>
      </text>
      {message && <text><span fg="green">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">s: skip (save empty pipeline) · Esc: back</span></text>
      </box>
    </box>
  );
}
