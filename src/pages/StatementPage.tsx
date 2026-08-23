import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStatement } from '../lib/api';
import { formatCurrency, formatDate, startOfMonthISO, todayISO } from '../lib/format';
import { printPage } from '../lib/print';
import type { StatementEntry, StatementResult } from '../types/database';

interface LedgerRow extends StatementEntry {
  running_balance: number;
}

export default function StatementPage() {
  const [fromDate, setFromDate] = useState(startOfMonthISO);
  const [toDate, setToDate] = useState(todayISO);
  const [statement, setStatement] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const data = await fetchStatement({ from_date: fromDate, to_date: toDate });
      setStatement(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

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

  const ledger: LedgerRow[] = useMemo(() => {
    if (!statement) return [];
    let balance = statement.opening_balance;
    return statement.entries.map((entry) => {
      balance += Number(entry.debit) - Number(entry.credit);
      return { ...entry, running_balance: balance };
    });
  }, [statement]);

  function exportCsv() {
    if (!statement) return;
    const headers = ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'];
    const openingRow = [
      fromDate,
      'opening',
      'Opening balance',
      '',
      '',
      statement.opening_balance.toFixed(2),
    ];
    const rows = ledger.map((row) => [
      row.entry_date,
      row.entry_type,
      row.reference_label,
      row.debit > 0 ? row.debit.toFixed(2) : '',
      row.credit > 0 ? row.credit.toFixed(2) : '',
      row.running_balance.toFixed(2),
    ]);
    const csv = [headers, openingRow, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetToCurrentMonth() {
    setFromDate(startOfMonthISO());
    setToDate(todayISO());
  }

  return (
    <>
      <div className="card-header no-print" style={{ marginBottom: '1rem' }}>
        <h1>Statement</h1>
        <div className="btn-group">
          <button
            className="btn btn-secondary"
            onClick={() => printPage()}
            disabled={!statement}
          >
            Print
          </button>
          <button className="btn btn-secondary" onClick={exportCsv} disabled={!statement}>
            Export CSV
          </button>
        </div>
      </div>

      <p className="text-muted no-print" style={{ marginTop: 0 }}>
        Invoice debits and payment credits for Heritage Veterinary Hospital.
      </p>

      <div className="filter-bar no-print">
        <div>
          <label htmlFor="from_date">From</label>
          <input
            id="from_date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="to_date">To</label>
          <input
            id="to_date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={resetToCurrentMonth}>
          This month
        </button>
      </div>

      {statement && (
        <div className="stat-grid no-print">
          <div className="stat">
            <div className="stat-label">Opening balance</div>
            <div className="stat-value">{formatCurrency(statement.opening_balance)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Invoiced</div>
            <div className="stat-value">{formatCurrency(statement.total_debits)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Received</div>
            <div className="stat-value text-success">{formatCurrency(statement.total_credits)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Closing balance</div>
            <div className="stat-value">{formatCurrency(statement.closing_balance)}</div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : !statement ? (
        <div className="empty-state">No statement data.</div>
      ) : (
        <div className="card statement-print">
          <h2 style={{ marginTop: 0 }}>Statement</h2>
          <p className="text-muted" style={{ marginTop: 0 }}>
            {formatDate(statement.from_date)} — {formatDate(statement.to_date)}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{formatDate(fromDate)}</td>
                  <td colSpan={2} className="text-muted">Opening balance</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">{formatCurrency(statement.opening_balance)}</td>
                </tr>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted" style={{ textAlign: 'center' }}>
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  ledger.map((row, i) => (
                    <tr key={`${row.reference_id}-${i}`}>
                      <td>{formatDate(row.entry_date)}</td>
                      <td>{row.entry_type}</td>
                      <td>
                        {row.entry_type === 'invoice' ? (
                          <Link to={`/invoices/${row.reference_id}`}>
                            {row.reference_label}
                          </Link>
                        ) : (
                          row.reference_label
                        )}
                      </td>
                      <td className="text-right">
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </td>
                      <td className="text-right text-success">
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </td>
                      <td className="text-right">{formatCurrency(row.running_balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
