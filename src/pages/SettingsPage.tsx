import { useEffect, useState } from 'react';
import { fetchSettings, updateSettings } from '../lib/api';
import type { Settings } from '../types/database';

type SettingsForm = Omit<Settings, 'id' | 'updated_at'>;

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        if (s) {
          const { id: _id, updated_at: _ua, ...rest } = s;
          setForm(rest);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateSettings(form);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (!form) return <div className="alert alert-error">Settings not found.</div>;

  return (
    <>
      <h1>Settings</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">Settings saved.</div>}

      <div className="card">
        <form onSubmit={handleSubmit} className="form-grid">
          <h2>Supplier details</h2>
          <div>
            <label htmlFor="supplier_name">Supplier name</label>
            <input
              id="supplier_name"
              type="text"
              value={form.supplier_name}
              onChange={(e) => update('supplier_name', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="supplier_abn">ABN</label>
            <input
              id="supplier_abn"
              type="text"
              value={form.supplier_abn}
              onChange={(e) => update('supplier_abn', e.target.value)}
            />
          </div>

          <h2>Bank details</h2>
          <div>
            <label htmlFor="bank_account_name">Account name</label>
            <input
              id="bank_account_name"
              type="text"
              value={form.bank_account_name}
              onChange={(e) => update('bank_account_name', e.target.value)}
            />
          </div>
          <div className="form-row form-row-2">
            <div>
              <label htmlFor="bsb">BSB</label>
              <input
                id="bsb"
                type="text"
                value={form.bsb}
                onChange={(e) => update('bsb', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="account_number">Account number</label>
              <input
                id="account_number"
                type="text"
                value={form.account_number}
                onChange={(e) => update('account_number', e.target.value)}
              />
            </div>
          </div>

          <h2>Customer defaults</h2>
          <div>
            <label htmlFor="default_customer_name">Default customer name</label>
            <input
              id="default_customer_name"
              type="text"
              value={form.default_customer_name}
              onChange={(e) => update('default_customer_name', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="default_customer_location">Default customer location</label>
            <input
              id="default_customer_location"
              type="text"
              value={form.default_customer_location}
              onChange={(e) => update('default_customer_location', e.target.value)}
            />
          </div>

          <h2>Invoicing</h2>
          <div>
            <label htmlFor="invoice_line_description">Default invoice line description</label>
            <input
              id="invoice_line_description"
              type="text"
              value={form.invoice_line_description}
              onChange={(e) => update('invoice_line_description', e.target.value)}
              placeholder="e.g. Repairs, IT support"
            />
            <p className="text-muted" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
              Shown on invoices sent to the clinic. Ultrasound case details are kept separately.
            </p>
          </div>

          <h2>Tax</h2>
          <div className="checkbox-row">
            <input
              id="gst_registered"
              type="checkbox"
              checked={form.gst_registered}
              onChange={(e) => update('gst_registered', e.target.checked)}
            />
            <label htmlFor="gst_registered">
              GST registered (shows &quot;Tax Invoice&quot; instead of &quot;Invoice&quot;)
            </label>
          </div>

          <div className="btn-group">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
