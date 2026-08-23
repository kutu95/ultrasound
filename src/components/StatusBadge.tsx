import type { InvoiceStatus } from '../types/database';

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function FreeBadge() {
  return <span className="badge badge-free">Free</span>;
}
