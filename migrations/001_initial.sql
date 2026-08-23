-- Ultrasound Ledger — initial schema (standard PostgreSQL)
-- Run: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE exam_type AS ENUM (
  'Echocardiography',
  'Abdominal ultrasound',
  'Pregnancy diagnosis',
  'Other'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'issued',
  'paid',
  'void'
);

-- Settings (singleton row)
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  supplier_name TEXT NOT NULL DEFAULT '',
  supplier_abn TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  bsb TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  gst_registered BOOLEAN NOT NULL DEFAULT false,
  default_customer_name TEXT NOT NULL DEFAULT 'Heritage Veterinary Hospital',
  default_customer_location TEXT NOT NULL DEFAULT 'Busselton WA',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (1);

-- Users (simple local auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session store (express-session + connect-pg-simple)
CREATE TABLE sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_expire_idx ON sessions (expire);

-- Invoice number sequence
CREATE SEQUENCE invoice_number_seq START 1001;

-- Cases
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_date DATE NOT NULL,
  owner_surname TEXT NOT NULL,
  pet_name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT '',
  exam_type exam_type NOT NULL,
  findings_text TEXT NOT NULL DEFAULT '',
  conclusion_text TEXT NOT NULL DEFAULT '',
  image_notes TEXT NOT NULL DEFAULT '',
  standard_fee NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
  actual_fee NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
  is_free BOOLEAN NOT NULL DEFAULT false,
  free_reason TEXT,
  billing_note TEXT,
  invoice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_exam_date ON cases (exam_date);
CREATE INDEX idx_cases_invoice_id ON cases (invoice_id);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_date DATE NOT NULL,
  customer_name TEXT NOT NULL DEFAULT 'Heritage Veterinary Hospital',
  customer_location TEXT NOT NULL DEFAULT 'Busselton WA',
  status invoice_status NOT NULL DEFAULT 'draft',
  suggested_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  override_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoices_override_reason_check CHECK (
    final_total = suggested_total OR (override_reason IS NOT NULL AND trim(override_reason) <> '')
  )
);

CREATE INDEX idx_invoices_service_date ON invoices (service_date);
CREATE INDEX idx_invoices_status ON invoices (status);

-- Invoice items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases (id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  UNIQUE (invoice_id, case_id)
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items (invoice_id);

ALTER TABLE cases
  ADD CONSTRAINT cases_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL;

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_payment_date ON payments (payment_date);

-- Payment allocations
CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX idx_payment_allocations_payment_id ON payment_allocations (payment_id);
CREATE INDEX idx_payment_allocations_invoice_id ON payment_allocations (invoice_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Billing functions
CREATE OR REPLACE FUNCTION calculate_suggested_total(p_service_date DATE)
RETURNS NUMERIC AS $$
DECLARE
  billable_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO billable_count
  FROM cases
  WHERE exam_date = p_service_date
    AND is_free = false
    AND invoice_id IS NULL;

  IF billable_count = 0 THEN
    RETURN 0;
  ELSIF billable_count <= 2 THEN
    RETURN 300;
  ELSE
    RETURN 300 + (billable_count - 2) * 150;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION validate_payment_allocations()
RETURNS TRIGGER AS $$
DECLARE
  payment_total NUMERIC;
  allocated_total NUMERIC;
BEGIN
  SELECT amount INTO payment_total FROM payments WHERE id = NEW.payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO allocated_total
  FROM payment_allocations
  WHERE payment_id = NEW.payment_id
    AND id IS DISTINCT FROM NEW.id;

  allocated_total := allocated_total + NEW.amount;

  IF allocated_total > payment_total THEN
    RAISE EXCEPTION 'Payment allocations (%) exceed payment amount (%)',
      allocated_total, payment_total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_allocations_validate
  BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_payment_allocations();

CREATE OR REPLACE FUNCTION validate_invoice_allocation()
RETURNS TRIGGER AS $$
DECLARE
  invoice_final NUMERIC;
  invoice_status_val invoice_status;
  already_allocated NUMERIC;
  new_total_allocated NUMERIC;
BEGIN
  SELECT final_total, status INTO invoice_final, invoice_status_val
  FROM invoices WHERE id = NEW.invoice_id;

  IF invoice_status_val = 'void' THEN
    RAISE EXCEPTION 'Cannot allocate payment to void invoice';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO already_allocated
  FROM payment_allocations
  WHERE invoice_id = NEW.invoice_id
    AND id IS DISTINCT FROM NEW.id;

  new_total_allocated := already_allocated + NEW.amount;

  IF new_total_allocated > invoice_final THEN
    RAISE EXCEPTION 'Invoice allocations (%) exceed invoice total (%)',
      new_total_allocated, invoice_final;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_allocations_invoice_validate
  BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_invoice_allocation();

CREATE OR REPLACE FUNCTION update_invoice_status_on_allocation()
RETURNS TRIGGER AS $$
DECLARE
  target_invoice_id UUID;
  invoice_final NUMERIC;
  total_allocated NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_invoice_id := OLD.invoice_id;
  ELSE
    target_invoice_id := NEW.invoice_id;
  END IF;

  SELECT final_total INTO invoice_final FROM invoices WHERE id = target_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO total_allocated
  FROM payment_allocations WHERE invoice_id = target_invoice_id;

  IF total_allocated >= invoice_final AND invoice_final > 0 THEN
    UPDATE invoices SET status = 'paid' WHERE id = target_invoice_id AND status = 'issued';
  ELSIF total_allocated > 0 THEN
    UPDATE invoices SET status = 'issued' WHERE id = target_invoice_id AND status = 'paid';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_allocations_status_update
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION update_invoice_status_on_allocation();

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || nextval('invoice_number_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION issue_invoice(
  p_invoice_id UUID,
  p_line_items JSONB,
  p_final_total NUMERIC,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS invoices AS $$
DECLARE
  v_invoice invoices;
  v_suggested NUMERIC;
  v_item JSONB;
  v_case_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status NOT IN ('draft') THEN
    RAISE EXCEPTION 'Only draft invoices can be issued';
  END IF;

  v_suggested := calculate_suggested_total(v_invoice.service_date);

  IF p_final_total <> v_suggested AND (p_override_reason IS NULL OR trim(p_override_reason) = '') THEN
    RAISE EXCEPTION 'Override reason required when final total differs from suggested total';
  END IF;

  DELETE FROM invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_case_id := (v_item->>'case_id')::UUID;

    INSERT INTO invoice_items (invoice_id, case_id, description, amount)
    VALUES (
      p_invoice_id,
      v_case_id,
      v_item->>'description',
      (v_item->>'amount')::NUMERIC
    );

    UPDATE cases SET invoice_id = p_invoice_id WHERE id = v_case_id;
  END LOOP;

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

-- Views
CREATE OR REPLACE VIEW invoice_balances AS
SELECT
  i.id,
  i.invoice_number,
  i.invoice_date,
  i.service_date,
  i.customer_name,
  i.status,
  i.final_total,
  COALESCE(SUM(pa.amount), 0) AS paid_amount,
  i.final_total - COALESCE(SUM(pa.amount), 0) AS outstanding
FROM invoices i
LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
WHERE i.status <> 'void'
GROUP BY i.id;

CREATE OR REPLACE VIEW statement_ledger AS
SELECT
  i.invoice_date AS entry_date,
  'invoice'::TEXT AS entry_type,
  i.id AS reference_id,
  i.invoice_number AS reference_label,
  i.final_total AS debit,
  0::NUMERIC AS credit,
  i.created_at
FROM invoices i
WHERE i.status IN ('issued', 'paid')
UNION ALL
SELECT
  p.payment_date AS entry_date,
  'payment'::TEXT AS entry_type,
  p.id AS reference_id,
  COALESCE(NULLIF(trim(p.reference), ''), 'Payment') AS reference_label,
  0::NUMERIC AS debit,
  p.amount AS credit,
  p.created_at
FROM payments p
ORDER BY entry_date, created_at;
