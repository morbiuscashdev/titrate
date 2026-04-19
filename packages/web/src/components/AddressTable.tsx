import { Button } from './ui';

export type AddressTableRow = {
  readonly address: string;
  readonly amount?: string;
  readonly conflict?: boolean;
};

export type AddressTableProps = {
  readonly rows: readonly AddressTableRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  readonly onPageChange?: (page: number) => void;
  readonly showAmounts?: boolean;
};

export function AddressTable({ rows, page, pageSize, totalRows, onPageChange, showAmounts }: AddressTableProps) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalRows);
  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div>
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b-2 border-[color:var(--edge)] text-[color:var(--fg-muted)] font-mono text-[10px] uppercase tracking-[0.15em]">
            <th className="pb-2 font-bold">Address</th>
            {showAmounts && <th className="pb-2 font-bold">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.address}
              data-conflict={row.conflict ? 'true' : undefined}
              className={`border-b border-[color:var(--edge)]/30 ${row.conflict ? 'bg-[color:var(--color-err)]/10' : ''}`}
            >
              <td className="py-2 font-mono text-[color:var(--fg-primary)]">{row.address}</td>
              {showAmounts && <td className="py-2 font-mono text-[color:var(--fg-muted)]">{row.amount ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between font-mono text-xs text-[color:var(--fg-muted)]">
        <span>{start}–{end} of {totalRows}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPageChange?.(page - 1)}>
            Prev
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => onPageChange?.(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
