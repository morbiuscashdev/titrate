import { Card } from "./Card";

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)]">{label}</p>
      <p className="font-sans text-3xl font-extrabold tracking-tight text-[color:var(--fg-primary)] mt-1">{value}</p>
      {sub ? <p className="font-mono text-xs text-[color:var(--color-cream-700)] mt-1">{sub}</p> : null}
    </Card>
  );
}
