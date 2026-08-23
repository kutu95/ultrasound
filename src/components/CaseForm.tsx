import { useState } from 'react';
import {
  formatSpecies,
  parseSpecies,
  SPECIES_OPTIONS,
  type SpeciesOption,
} from '../lib/species';
import {
  DEFAULT_CASE_FORM,
  EXAM_TYPES,
  type CaseFormData,
  type UltrasoundCase,
} from '../types/database';

interface CaseFormProps {
  initial?: UltrasoundCase;
  onSubmit: (data: CaseFormData) => Promise<void>;
  onCancel: () => void;
}

function initialSpeciesState(initial?: UltrasoundCase) {
  const parsed = parseSpecies(initial?.species ?? DEFAULT_CASE_FORM.species);
  return { kind: parsed.kind, other: parsed.other };
}

export default function CaseForm({ initial, onSubmit, onCancel }: CaseFormProps) {
  const [form, setForm] = useState<CaseFormData>(
    initial
      ? {
          exam_date: initial.exam_date,
          owner_surname: initial.owner_surname,
          pet_name: initial.pet_name,
          species: initial.species,
          exam_type: initial.exam_type,
          findings_text: initial.findings_text,
          conclusion_text: initial.conclusion_text,
          image_notes: initial.image_notes,
          standard_fee: initial.standard_fee,
          actual_fee: initial.actual_fee,
          is_free: initial.is_free,
          free_reason: initial.free_reason ?? '',
          billing_note: initial.billing_note ?? '',
        }
      : { ...DEFAULT_CASE_FORM },
  );
  const [speciesKind, setSpeciesKind] = useState<SpeciesOption>(
    () => initialSpeciesState(initial).kind,
  );
  const [speciesOther, setSpeciesOther] = useState(
    () => initialSpeciesState(initial).other,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CaseFormData>(key: K, value: CaseFormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'is_free' && value === true) {
        next.actual_fee = 0;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.owner_surname.trim() || !form.pet_name.trim()) {
      setError('Owner surname and pet name are required.');
      return;
    }
    if (speciesKind === 'other' && !speciesOther.trim()) {
      setError('Please specify the species.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        species: formatSpecies(speciesKind, speciesOther),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save case');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-row form-row-2">
        <div>
          <label htmlFor="exam_date">Exam date</label>
          <input
            id="exam_date"
            type="date"
            value={form.exam_date}
            onChange={(e) => update('exam_date', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="exam_type">Exam type</label>
          <select
            id="exam_type"
            value={form.exam_type}
            onChange={(e) => update('exam_type', e.target.value as CaseFormData['exam_type'])}
          >
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row form-row-2">
        <div>
          <label htmlFor="owner_surname">Owner surname</label>
          <input
            id="owner_surname"
            type="text"
            value={form.owner_surname}
            onChange={(e) => update('owner_surname', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="pet_name">Pet name</label>
          <input
            id="pet_name"
            type="text"
            value={form.pet_name}
            onChange={(e) => update('pet_name', e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="species">Species</label>
        <select
          id="species"
          value={speciesKind}
          onChange={(e) => setSpeciesKind(e.target.value as SpeciesOption)}
        >
          {SPECIES_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'other' ? 'Other' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {speciesKind === 'other' && (
        <div>
          <label htmlFor="species_other">Specify species</label>
          <input
            id="species_other"
            type="text"
            value={speciesOther}
            onChange={(e) => setSpeciesOther(e.target.value)}
            placeholder="e.g. Rabbit, Horse"
            required
          />
        </div>
      )}

      <div>
        <label htmlFor="summary">Summary</label>
        <input
          id="summary"
          type="text"
          value={form.conclusion_text}
          onChange={(e) => update('conclusion_text', e.target.value)}
          placeholder="e.g. suspect spleen, cysto, cushings screen"
        />
        <p className="text-muted" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          Short label to help find this case when scanning the list.
        </p>
      </div>

      <div>
        <label htmlFor="report_text">Report</label>
        <textarea
          id="report_text"
          value={form.findings_text}
          onChange={(e) => update('findings_text', e.target.value)}
          placeholder="Full ultrasound report text for email"
          style={{ minHeight: '160px' }}
        />
      </div>

      <div>
        <label htmlFor="image_notes">Image notes</label>
        <input
          id="image_notes"
          type="text"
          value={form.image_notes}
          onChange={(e) => update('image_notes', e.target.value)}
          placeholder="e.g. 12 images saved to PACS"
        />
      </div>

      <div className="form-row form-row-2">
        <div>
          <label htmlFor="standard_fee">Standard fee ($)</label>
          <input
            id="standard_fee"
            type="number"
            min="0"
            step="0.01"
            value={form.standard_fee}
            onChange={(e) => update('standard_fee', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label htmlFor="actual_fee">Actual fee ($)</label>
          <input
            id="actual_fee"
            type="number"
            min="0"
            step="0.01"
            value={form.actual_fee}
            onChange={(e) => update('actual_fee', parseFloat(e.target.value) || 0)}
            disabled={form.is_free}
          />
        </div>
      </div>

      <div className="checkbox-row">
        <input
          id="is_free"
          type="checkbox"
          checked={form.is_free}
          onChange={(e) => update('is_free', e.target.checked)}
        />
        <label htmlFor="is_free">Mark as free (no charge)</label>
      </div>

      {form.is_free && (
        <div>
          <label htmlFor="free_reason">Free reason</label>
          <input
            id="free_reason"
            type="text"
            value={form.free_reason}
            onChange={(e) => update('free_reason', e.target.value)}
            placeholder="e.g. Staff pet — complimentary"
          />
        </div>
      )}

      <div>
        <label htmlFor="billing_note">Billing note (optional)</label>
        <input
          id="billing_note"
          type="text"
          value={form.billing_note}
          onChange={(e) => update('billing_note', e.target.value)}
        />
      </div>

      <div className="btn-group">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Update case' : 'Add case'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
