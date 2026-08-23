import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FreeBadge } from '../components/StatusBadge';
import { createCase, deleteCase, fetchCases } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import type { CaseFormData, UltrasoundCase } from '../types/database';
import CaseForm from '../components/CaseForm';

export default function CasesPage() {
  const [cases, setCases] = useState<UltrasoundCase[]>([]);
  const [filterDate, setFilterDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCases(filterDate ? { exam_date: filterDate } : undefined);
      setCases(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  async function handleCreate(form: CaseFormData) {
    await createCase(form);
    setShowForm(false);
    await loadCases();
  }

  async function handleDelete(c: UltrasoundCase) {
    if (c.invoice_id) {
      alert('Cannot delete an invoiced case. Void the invoice first.');
      return;
    }
    if (!confirm(`Delete case for ${c.pet_name} (${c.owner_surname})?`)) return;
    try {
      await deleteCase(c.id);
      await loadCases();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  const uninvoicedDates = [
    ...new Set(
      cases.filter((c) => !c.invoice_id).map((c) => c.exam_date),
    ),
  ].sort().reverse();

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <h1>Cases</h1>
        <div className="btn-group">
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Add case
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2>New case</h2>
          <CaseForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="filter-bar">
        <div>
          <label htmlFor="filter_date">Filter by date</label>
          <input
            id="filter_date"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
        {filterDate && (
          <button className="btn btn-secondary" onClick={() => setFilterDate('')}>
            Clear
          </button>
        )}
        {filterDate && uninvoicedDates.includes(filterDate) && (
          <Link
            to={`/invoices/new?date=${filterDate}`}
            className="btn btn-primary"
          >
            Create invoice for {formatDate(filterDate)}
          </Link>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="empty-state">No cases found.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Owner</th>
                  <th>Summary</th>
                  <th>Exam</th>
                  <th className="text-right">Fee</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.exam_date)}</td>
                    <td>
                      <Link to={`/cases/${c.id}`}>{c.pet_name}</Link>
                    </td>
                    <td>{c.owner_surname}</td>
                    <td className="text-muted">{c.conclusion_text || '—'}</td>
                    <td>{c.exam_type}</td>
                    <td className="text-right">
                      {c.is_free ? '—' : formatCurrency(c.actual_fee)}
                    </td>
                    <td>
                      {c.is_free && <FreeBadge />}{' '}
                      {c.invoice_id ? (
                        <span className="text-muted">Invoiced</span>
                      ) : (
                        <span className="text-muted">Open</span>
                      )}
                    </td>
                    <td>
                      <div className="btn-group">
                        <Link to={`/cases/${c.id}/report`} className="btn btn-secondary btn-sm">
                          Report
                        </Link>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(c)}
                          disabled={!!c.invoice_id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!filterDate && uninvoicedDates.length > 0 && (
        <div className="card">
          <h2>Create invoice by date</h2>
          <p className="text-muted">Dates with uninvoiced cases:</p>
          <div className="btn-group">
            {uninvoicedDates.map((d) => (
              <Link key={d} to={`/invoices/new?date=${d}`} className="btn btn-secondary">
                {formatDate(d)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
