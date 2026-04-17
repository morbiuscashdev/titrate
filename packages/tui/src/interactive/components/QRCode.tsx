import { useEffect, useState } from 'react';

export function QRCode({ value }: { value: string }) {
  const [ascii, setAscii] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(async (QRCodeLib) => {
      try {
        const out = await QRCodeLib.toString(value, { type: 'terminal', small: true });
        if (!cancelled) setAscii(out);
      } catch { /* swallow */ }
    });
    return () => { cancelled = true; };
  }, [value]);

  return (
    <box flexDirection="column">
      <text>{ascii || '(generating QR…)'}</text>
    </box>
  );
}
