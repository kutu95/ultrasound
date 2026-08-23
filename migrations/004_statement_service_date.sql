-- Use service date (not invoice/issue date) for invoice entries on the statement

CREATE OR REPLACE VIEW statement_ledger AS
SELECT
  i.service_date AS entry_date,
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
