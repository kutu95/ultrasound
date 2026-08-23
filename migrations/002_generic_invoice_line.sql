-- Generic invoice line items: one description on the invoice, cases linked via cases.invoice_id

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS invoice_line_description TEXT NOT NULL DEFAULT 'Repairs, IT support';

UPDATE settings SET invoice_line_description = 'Repairs, IT support' WHERE invoice_line_description = '';

ALTER TABLE invoice_items ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_case_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_invoice_case_unique
  ON invoice_items (invoice_id, case_id)
  WHERE case_id IS NOT NULL;

CREATE OR REPLACE FUNCTION issue_invoice(
  p_invoice_id UUID,
  p_case_ids JSONB,
  p_line_description TEXT,
  p_final_total NUMERIC,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
  v_suggested NUMERIC;
  v_case_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status NOT IN ('draft') THEN
    RAISE EXCEPTION 'Only draft invoices can be issued';
  END IF;

  IF p_line_description IS NULL OR trim(p_line_description) = '' THEN
    RAISE EXCEPTION 'Line description is required';
  END IF;

  v_suggested := calculate_suggested_total(v_invoice.service_date);

  IF p_final_total <> v_suggested AND (p_override_reason IS NULL OR trim(p_override_reason) = '') THEN
    RAISE EXCEPTION 'Override reason required when final total differs from suggested total';
  END IF;

  DELETE FROM invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_case_id IN
    SELECT value::UUID FROM jsonb_array_elements_text(p_case_ids)
  LOOP
    UPDATE cases SET invoice_id = p_invoice_id WHERE id = v_case_id;
  END LOOP;

  INSERT INTO invoice_items (invoice_id, case_id, description, amount)
  VALUES (p_invoice_id, NULL, trim(p_line_description), p_final_total);

  UPDATE invoices SET
    suggested_total = v_suggested,
    final_total = p_final_total,
    override_reason = p_override_reason,
    status = 'issued'
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$ LANGUAGE plpgsql;
