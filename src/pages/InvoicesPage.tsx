import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { fetchInvoiceBalances } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import type { InvoiceBalance } from '../types/database';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoiceBalances()
      .then(setInvoices)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <h1>Invoices</h1>
        <Link to="/cases" className="btn btn-primary">
          Create from cases
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">No invoices yet.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Invoice date</th>
                  <th>Service date</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td>{formatDate(inv.invoice_date)}</td>
                    <td>{formatDate(inv.service_date)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="text-right">{formatCurrency(inv.final_total)}</td>
                    <td className="text-right">
                      {inv.outstanding > 0 ? (
                        <span className="text-danger">{formatCurrency(inv.outstanding)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
