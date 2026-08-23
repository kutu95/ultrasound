import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchRecentCases,
  fetchRecentPayments,
  fetchTotalOutstanding,
  fetchUnpaidInvoices,
} from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import type { InvoiceBalance, Payment, UltrasoundCase } from '../types/database';

export default function DashboardPage() {
  const [outstanding, setOutstanding] = useState(0);
  const [unpaid, setUnpaid] = useState<InvoiceBalance[]>([]);
  const [recentCases, setRecentCases] = useState<UltrasoundCase[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [total, unpaidInv, cases, payments] = await Promise.all([
          fetchTotalOutstanding(),
          fetchUnpaidInvoices(),
          fetchRecentCases(8),
          fetchRecentPayments(5),
        ]);
        setOutstanding(total);
        setUnpaid(unpaidInv);
        setRecentCases(cases);
        setRecentPayments(payments);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <>
      <h1>Dashboard</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{formatCurrency(outstanding)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unpaid Invoices</div>
          <div className="stat-value">{unpaid.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Unpaid Invoices</h2>
          <Link to="/invoices" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        {unpaid.length === 0 ? (
          <p className="text-muted">No outstanding invoices.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Service date</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {unpaid.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td>{formatDate(inv.service_date)}</td>
                    <td className="text-right">{formatCurrency(inv.final_total)}</td>
                    <td className="text-right text-danger">
                      {formatCurrency(inv.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent Cases</h2>
          <Link to="/cases" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        {recentCases.length === 0 ? (
          <p className="text-muted">No cases yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Owner</th>
                  <th>Summary</th>
                  <th>Invoiced</th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.exam_date)}</td>
                    <td>
                      <Link to={`/cases/${c.id}`}>{c.pet_name}</Link>
                    </td>
                    <td>{c.owner_surname}</td>
                    <td className="text-muted">{c.conclusion_text || '—'}</td>
                    <td>{c.invoice_id ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent Payments</h2>
          <Link to="/payments" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        {recentPayments.length === 0 ? (
          <p className="text-muted">No payments recorded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date)}</td>
                    <td>{p.reference || '—'}</td>
                    <td className="text-right text-success">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
