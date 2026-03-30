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
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="pb-2 font-medium">Address</th>
            {showAmounts && <th className="pb-2 font-medium">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.address} className={`border-b border-gray-800/50 ${row.conflict ? 'bg-red-900/20' : ''}`}>
              <td className="py-2 font-mono text-gray-300">{row.address}</td>
              {showAmounts && <td className="py-2 text-gray-400">{row.amount ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{start}–{end} of {totalRows}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => onPageChange?.(page - 1)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange?.(page + 1)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
        </div>
      </div>
    </div>
  );
}
