import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createPayment,
  fetchAllAllocations,
  fetchInvoiceBalances,
  fetchPayments,
} from '../lib/api';
import { formatCurrency, formatDate, todayISO } from '../lib/format';
import type { InvoiceBalance, Payment, PaymentAllocation } from '../types/database';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<InvoiceBalance[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceBalance[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    payment_date: todayISO(),
    amount: '',
    reference: '',
    notes: '',
  });

  const [allocationsForm, setAllocationsForm] = useState<
    { invoice_id: string; amount: string }[]
  >([{ invoice_id: '', amount: '' }]);

  async function load() {
    setLoading(true);
    try {
      const [p, i, a] = await Promise.all([
        fetchPayments(),
        fetchInvoiceBalances(),
        fetchAllAllocations(),
      ]);
      setPayments(p);
      setAllInvoices(i);
      setUnpaidInvoices(i.filter((inv) => inv.outstanding > 0 && inv.status !== 'void'));
      setAllocations(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function addAllocationRow() {
    setAllocationsForm((prev) => [...prev, { invoice_id: '', amount: '' }]);
  }

  function updateAllocationRow(
    index: number,
    field: 'invoice_id' | 'amount',
    value: string,
  ) {
    setAllocationsForm((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeAllocationRow(index: number) {
    setAllocationsForm((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    const validAllocations = allocationsForm
      .filter((a) => a.invoice_id && parseFloat(a.amount) > 0)
      .map((a) => ({
        invoice_id: a.invoice_id,
        amount: parseFloat(a.amount),
      }));

    const allocSum = validAllocations.reduce((s, a) => s + a.amount, 0);
    if (allocSum > amount) {
      setError('Allocations exceed payment amount.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createPayment({
        payment_date: form.payment_date,
        amount,
        reference: form.reference,
        notes: form.notes || undefined,
        allocations: validAllocations,
      });

      setShowForm(false);
      setForm({ payment_date: todayISO(), amount: '', reference: '', notes: '' });
      setAllocationsForm([{ invoice_id: '', amount: '' }]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  }

  function getAllocationsForPayment(paymentId: string) {
    return allocations.filter((a) => a.payment_id === paymentId);
  }

  function getInvoiceLabel(invoiceId: string) {
    const inv = allInvoices.find((i) => i.id === invoiceId);
    return inv?.invoice_number ?? invoiceId.slice(0, 8);
  }

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <h1>Payments</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Record payment
          </button>
        )}
      </div>

      {showForm && (
        <div className="card">
          <h2>New payment</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-row form-row-2">
              <div>
                <label htmlFor="payment_date">Payment date</label>
                <input
                  id="payment_date"
                  type="date"
                  value={form.payment_date}
                  onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="amount">Amount ($)</label>
                <input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="reference">Reference</label>
              <input
                id="reference"
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="e.g. EFT-20250610"
              />
            </div>
            <div>
              <label htmlFor="notes">Notes</label>
              <input
                id="notes"
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div>
              <h3>Allocate to invoices (optional)</h3>
              <p className="text-muted" style={{ marginTop: 0, fontSize: '0.875rem' }}>
                Leave blank to apply this payment automatically to the oldest outstanding invoices.
              </p>
              {allocationsForm.map((row, i) => (
                <div key={i} className="form-row form-row-2" style={{ marginBottom: '0.5rem' }}>
                  <div>
                    <select
                      value={row.invoice_id}
                      onChange={(e) => updateAllocationRow(i, 'invoice_id', e.target.value)}
                    >
                      <option value="">Select invoice…</option>
                      {unpaidInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} — {formatCurrency(inv.outstanding)} outstanding
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount"
                      value={row.amount}
                      onChange={(e) => updateAllocationRow(i, 'amount', e.target.value)}
                    />
                    {allocationsForm.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeAllocationRow(i)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addAllocationRow}>
                Add allocation
              </button>
            </div>

            <div className="btn-group">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save payment'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : payments.length === 0 ? (
        <div className="empty-state">No payments recorded.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                  <th>Allocated to</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const allocs = getAllocationsForPayment(p.id);
                  const allocatedSum = allocs.reduce((s, a) => s + Number(a.amount), 0);
                  return (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td>{p.reference || '—'}</td>
                      <td className="text-right text-success">
                        {formatCurrency(p.amount)}
                      </td>
                      <td>
                        {allocs.length === 0 ? (
                          <span className="text-muted">Unallocated ({formatCurrency(p.amount - allocatedSum)})</span>
                        ) : (
                          allocs.map((a) => (
                            <div key={a.id}>
                              <Link to={`/invoices/${a.invoice_id}`}>
                                {getInvoiceLabel(a.invoice_id)}
                              </Link>
                              : {formatCurrency(a.amount)}
                            </div>
                          ))
                        )}
                      </td>
                      <td>{p.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
