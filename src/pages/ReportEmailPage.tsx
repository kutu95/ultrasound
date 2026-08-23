import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCase, fetchCaseImages } from '../lib/api';
import { generateReportEmail } from '../lib/format';

export default function ReportEmailPage() {
  const { id } = useParams<{ id: string }>();
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ subject: string; body: string } | null>(null);
  const [petName, setPetName] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchCase(id), fetchCaseImages(id)])
      .then(([c, images]) => {
        if (!c) throw new Error('Case not found');
        setPetName(c.pet_name);
        setReport(generateReportEmail({ ...c, image_count: images.length }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function copy(text: string, which: 'subject' | 'body' | 'all') {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!report) return null;

  const fullText = `Subject: ${report.subject}\n\n${report.body}`;

  return (
    <>
      <div className="card-header" style={{ marginBottom: '1rem' }}>
        <h1>Report email — {petName}</h1>
        <Link to={`/cases/${id}`} className="btn btn-secondary">
          Back to case
        </Link>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Subject</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => copy(report.subject, 'subject')}
          >
            {copied === 'subject' ? 'Copied!' : 'Copy subject'}
          </button>
        </div>
        <div className="copy-box">{report.subject}</div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Body</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => copy(report.body, 'body')}
          >
            {copied === 'body' ? 'Copied!' : 'Copy body'}
          </button>
        </div>
        <div className="copy-box">{report.body}</div>
      </div>

      <div className="btn-group">
        <button className="btn btn-primary" onClick={() => copy(fullText, 'all')}>
          {copied === 'all' ? 'Copied!' : 'Copy all'}
        </button>
      </div>
    </>
  );
}
