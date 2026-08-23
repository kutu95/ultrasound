import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import {
  fetchInvoice,
  fetchInvoiceCases,
  fetchInvoiceItems,
  fetchSettings,
  voidInvoice,
} from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import { printPage } from '../lib/print';
import { displaySpecies } from '../lib/species';
import type { Invoice, InvoiceItem, Settings, UltrasoundCase } from '../types/database';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [linkedCases, setLinkedCases] = useState<UltrasoundCase[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchInvoice(id), fetchInvoiceItems(id), fetchInvoiceCases(id), fetchSettings()])
      .then(([inv, its, linked, sett]) => {
        setInvoice(inv);
        setItems(its);
        setLinkedCases(linked);
        setSettings(sett);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const previousTitle = document.title;
    const onBeforePrint = () => {
      document.title = ' ';
    };
    const onAfterPrint = () => {
      document.title = previousTitle;
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.title = previousTitle;
    };
  }, []);

  async function handleVoid() {
    if (!invoice || !confirm(`Void invoice ${invoice.invoice_number}?`)) return;
    try {
      await voidInvoice(invoice.id);
      const updated = await fetchInvoice(invoice.id);
      setInvoice(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to void');
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!invoice) return <div className="alert alert-error">Invoice not found.</div>;

  const invoiceTitle = settings?.gst_registered ? 'Tax Invoice' : 'Invoice';

  return (
    <>
      <div className="card-header no-print" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>{invoice.invoice_number}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => printPage()}>
            Print
          </button>
          {invoice.status === 'draft' && (
            <Link to={`/invoices/new?date=${invoice.service_date}`} className="btn btn-primary">
              Continue editing
            </Link>
          )}
          {invoice.status === 'issued' && (
            <button className="btn btn-danger" onClick={handleVoid}>
              Void
            </button>
          )}
          <Link to="/invoices" className="btn btn-secondary">
            Back
          </Link>
        </div>
      </div>

      <div className="card invoice-print">
        <div className="invoice-print-header">
          <div>
            <div className="invoice-print-title">{invoiceTitle}</div>
            <p style={{ margin: '0.5rem 0 0' }}>
              <strong>{settings?.supplier_name || 'Supplier name'}</strong>
              <br />
              ABN: {settings?.supplier_abn || '—'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><strong>{invoice.invoice_number}</strong></div>
            <div>Invoice date: {formatDate(invoice.invoice_date)}</div>
            <div>Service date: {formatDate(invoice.service_date)}</div>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <strong>Bill to:</strong>
          <br />
          {invoice.customer_name}
          <br />
          {invoice.customer_location}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="text-right">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="invoice-totals">
          <div className="total-row">Total: {formatCurrency(invoice.final_total)}</div>
        </div>

        {invoice.override_reason && (
          <p className="text-muted no-print" style={{ marginTop: '1rem' }}>
            Note: {invoice.override_reason}
          </p>
        )}

        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <strong>Payment details</strong>
          <p style={{ margin: '0.5rem 0' }}>
            {settings?.bank_account_name && (
              <>
                Account name: {settings.bank_account_name}
                <br />
              </>
            )}
            BSB: {settings?.bsb || '—'} · Account: {settings?.account_number || '—'}
          </p>
          <p className="text-muted">No GST has been charged.</p>
        </div>

        {invoice.notes && (
          <p className="no-print" style={{ marginTop: '1rem' }}>
            <strong>Notes:</strong> {invoice.notes}
          </p>
        )}
      </div>

      {linkedCases.length > 0 && (
        <div className="card no-print">
          <h2>Ultrasound cases (internal record)</h2>
          <p className="text-muted">Not shown on the printed invoice.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Owner</th>
                  <th>Species</th>
                  <th>Exam</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {linkedCases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/cases/${c.id}`}>{c.pet_name}</Link>
                    </td>
                    <td>{c.owner_surname}</td>
                    <td>{displaySpecies(c.species)}</td>
                    <td>{c.exam_type}</td>
                    <td className="text-muted">{c.conclusion_text || '—'}</td>
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
