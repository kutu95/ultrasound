import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { calculateSuggestedTotal } from '../lib/billing';
import { createDraftInvoice, fetchCases, fetchSettings, issueInvoice } from '../lib/api';
import { displaySpecies } from '../lib/species';
import { formatCurrency, formatDate, todayISO } from '../lib/format';
import type { UltrasoundCase } from '../types/database';

export default function InvoiceNewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialDate = searchParams.get('date') ?? todayISO();

  const [serviceDate, setServiceDate] = useState(initialDate);
  const [cases, setCases] = useState<UltrasoundCase[]>([]);
  const [lineDescription, setLineDescription] = useState('Repairs, IT support');
  const [finalTotal, setFinalTotal] = useState(0);
  const [overrideReason, setOverrideReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedTotal = calculateSuggestedTotal(cases);
  const requiresOverrideReason = finalTotal !== suggestedTotal;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [data, settings] = await Promise.all([
          fetchCases({ exam_date: serviceDate, uninvoiced_only: true }),
          fetchSettings(),
        ]);
        setCases(data);
        setLineDescription(settings?.invoice_line_description ?? 'Repairs, IT support');
        const suggested = calculateSuggestedTotal(data);
        setFinalTotal(suggested);
        setOverrideReason('');
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load cases');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [serviceDate]);

  async function handleIssue() {
    if (cases.length === 0) {
      setError('No uninvoiced cases for this date.');
      return;
    }
    if (!lineDescription.trim()) {
      setError('Invoice line description is required.');
      return;
    }
    if (finalTotal !== suggestedTotal && !overrideReason.trim()) {
      setError('Override reason is required when final total differs from suggested total.');
      return;
    }

    setIssuing(true);
    setError(null);
    try {
      const draft = await createDraftInvoice(serviceDate);
      const invoice = await issueInvoice(
        draft.id,
        cases.map((c) => c.id),
        lineDescription.trim(),
        finalTotal,
        finalTotal !== suggestedTotal ? overrideReason.trim() : null,
      );
      navigate(`/invoices/${invoice.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to issue invoice');
      setIssuing(false);
    }
  }

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <h1>Create invoice</h1>
        <Link to="/cases" className="btn btn-secondary">
          Back to cases
        </Link>
      </div>

      <div className="filter-bar">
        <div>
          <label htmlFor="service_date">Service date</label>
          <input
            id="service_date"
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="alert alert-info">
          No uninvoiced cases for {formatDate(serviceDate)}.
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Ultrasound cases (internal record)</h2>
            <p className="text-muted">
              These cases are linked to the invoice for your records. They do not appear on the
              printed invoice.
            </p>
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
                  {cases.map((c) => (
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
            <p className="text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              Billing rule: $300 minimum covers first 1–2 billable exams; each additional exam $150.
              Free exams are $0.
            </p>
          </div>

          <div className="card">
            <h2>Invoice line</h2>
            <p className="text-muted">This is what appears on the invoice sent to the clinic.</p>
            <div className="form-grid">
              <div>
                <label htmlFor="line_description">Description</label>
                <input
                  id="line_description"
                  type="text"
                  value={lineDescription}
                  onChange={(e) => setLineDescription(e.target.value)}
                />
              </div>
              <div>
                <label>Suggested total</label>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {formatCurrency(suggestedTotal)}
                </div>
              </div>
              <div>
                <label htmlFor="final_total">Final total ($)</label>
                <input
                  id="final_total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={finalTotal}
                  onChange={(e) => setFinalTotal(parseFloat(e.target.value) || 0)}
                />
              </div>
              {requiresOverrideReason && (
                <div>
                  <label htmlFor="override_reason">Override reason (required)</label>
                  <input
                    id="override_reason"
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. Agreed discount, staff pet complimentary"
                  />
                </div>
              )}
            </div>
            <div className="btn-group" style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleIssue}
                disabled={issuing || (requiresOverrideReason && !overrideReason.trim())}
              >
                {issuing ? 'Issuing…' : 'Issue invoice'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
