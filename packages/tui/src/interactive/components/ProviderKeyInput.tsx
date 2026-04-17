import { useState, useMemo } from 'react';
import { splitTemplate, getProvider, type ProviderId } from '@titrate/sdk';

export type ProviderKeyInputProps = {
  readonly providerId: ProviderId;
  readonly chainId: number;
  readonly initialKey?: string;
  readonly focused: boolean;
  readonly onChange: (key: string, url: string | null) => void;
};

export function ProviderKeyInput({
  providerId, chainId, initialKey = '', focused, onChange,
}: ProviderKeyInputProps) {
  const [key, setKey] = useState(initialKey);
  const { prefix, suffix } = useMemo(
    () => splitTemplate(providerId, chainId),
    [providerId, chainId],
  );

  return (
    <box flexDirection="row">
      <text><span fg="gray">{prefix}</span></text>
      <input
        focused={focused}
        value={key}
        onChange={(next: string) => {
          setKey(next);
          onChange(next, next ? getProvider(providerId).buildUrl(chainId, next) : null);
        }}
        placeholder="your-api-key"
      />
      <text><span fg="gray">{suffix}</span></text>
    </box>
  );
}
