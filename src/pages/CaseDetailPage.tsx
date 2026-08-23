import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CaseForm from '../components/CaseForm';
import CaseImages from '../components/CaseImages';
import { FreeBadge } from '../components/StatusBadge';
import { deleteCase, fetchCase, updateCase } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import type { CaseFormData } from '../types/database';

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [caseData, setCaseData] = useState<Awaited<ReturnType<typeof fetchCase>>>(null);

  useEffect(() => {
    if (!id) return;
    fetchCase(id)
      .then(setCaseData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleUpdate(form: CaseFormData) {
    if (!id) return;
    const updated = await updateCase(id, form);
    setCaseData(updated);
    setEditing(false);
  }

  async function handleDelete() {
    if (!caseData) return;
    if (caseData.invoice_id) {
      alert('Cannot delete an invoiced case.');
      return;
    }
    if (!confirm(`Delete case for ${caseData.pet_name}?`)) return;
    await deleteCase(caseData.id);
    navigate('/cases');
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!caseData) return <div className="alert alert-error">Case not found.</div>;

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>
            {caseData.pet_name}{' '}
            <span className="text-muted" style={{ fontWeight: 400 }}>
              ({caseData.owner_surname})
            </span>
          </h1>
          <p className="text-muted">
            {formatDate(caseData.exam_date)} · {caseData.exam_type}
            {caseData.conclusion_text && <> · {caseData.conclusion_text}</>}
            {caseData.is_free && <> · <FreeBadge /></>}
          </p>
        </div>
        <div className="btn-group">
          <Link to={`/cases/${id}/report`} className="btn btn-primary">
            Generate report
          </Link>
          {!editing && !caseData.invoice_id && (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {caseData.invoice_id && !editing && (
            <span className="text-muted" style={{ fontSize: '0.875rem' }}>
              Invoiced — report locked
            </span>
          )}
          {!caseData.invoice_id && (
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete
            </button>
          )}
          <Link to="/cases" className="btn btn-secondary">
            Back
          </Link>
        </div>
      </div>

      {editing ? (
        <div className="card">
          <CaseForm
            initial={caseData}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="card">
          <dl style={{ margin: 0 }}>
            <dt className="text-muted">Species</dt>
            <dd>{caseData.species || '—'}</dd>
            <dt className="text-muted">Fee</dt>
            <dd>{caseData.is_free ? 'Free' : formatCurrency(caseData.actual_fee)}</dd>
            {caseData.is_free && caseData.free_reason && (
              <>
                <dt className="text-muted">Free reason</dt>
                <dd>{caseData.free_reason}</dd>
              </>
            )}
            {caseData.billing_note && (
              <>
                <dt className="text-muted">Billing note</dt>
                <dd>{caseData.billing_note}</dd>
              </>
            )}
            <dt className="text-muted">Invoiced</dt>
            <dd>
              {caseData.invoice_id ? (
                <Link to={`/invoices/${caseData.invoice_id}`}>View invoice</Link>
              ) : (
                'No'
              )}
            </dd>
            <dt className="text-muted">Summary</dt>
            <dd>{caseData.conclusion_text || '—'}</dd>
            <dt className="text-muted">Report</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{caseData.findings_text || '—'}</dd>
            {caseData.image_notes && (
              <>
                <dt className="text-muted">Image notes</dt>
                <dd>{caseData.image_notes}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {id && <CaseImages caseId={id} readOnly={Boolean(caseData.invoice_id)} />}
    </>
  );
}
