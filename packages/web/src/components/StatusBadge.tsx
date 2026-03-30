export type StatusBadgeProps = {
  readonly status: 'pending' | 'active' | 'complete' | 'error' | 'locked';
  readonly label?: string;
};

const statusStyles: Record<StatusBadgeProps['status'], string> = {
  pending: 'bg-gray-400/10 text-gray-400 ring-gray-400/20',
  active: 'bg-blue-400/10 text-blue-400 ring-blue-400/20',
  complete: 'bg-green-400/10 text-green-400 ring-green-400/20',
  error: 'bg-red-400/10 text-red-400 ring-red-400/20',
  locked: 'bg-gray-700/10 text-gray-600 ring-gray-700/20',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}>
      {label ?? status}
    </span>
  );
}
