import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: keyof T;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  mode?: "operator" | "brutalist";
};

export function DataTable<T>({ columns, rows, rowKey, mode = "operator" }: Props<T>) {
  if (mode === "brutalist") {
    return (
      <table className="w-full border-collapse border-2 border-[color:var(--edge)] bg-white shadow-[4px_4px_0_var(--shadow-color)]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className="bg-[color:var(--color-cream-900)] text-[color:var(--color-cream-50)] font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-left px-3 py-2.5"
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r)} className={i % 2 === 1 ? "bg-[color:var(--color-cream-100)]" : ""}>
              {columns.map((c) => (
                <td key={String(c.key)} className="font-mono text-[13px] text-[color:var(--color-cream-900)] px-3 py-2 border-b border-[color:var(--edge)]">
                  {c.render ? c.render(r) : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={String(c.key)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-ink-500)] text-left px-3 py-2 border-b border-[color:var(--color-ink-800)] font-medium"
              style={c.width ? { width: c.width } : undefined}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} className="hover:bg-[color:var(--color-ink-800)]/20">
            {columns.map((c) => (
              <td key={String(c.key)} className="font-mono text-xs text-[color:var(--color-ink-100)] px-3 py-1.5">
                {c.render ? c.render(r) : String(r[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
