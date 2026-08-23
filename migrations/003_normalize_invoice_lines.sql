-- Normalize existing invoices to a single generic line item.
-- Cases remain linked via cases.invoice_id for internal records.

DELETE FROM invoice_items ii
USING invoices i
WHERE ii.invoice_id = i.id
  AND i.status <> 'void';

INSERT INTO invoice_items (invoice_id, case_id, description, amount)
SELECT
  i.id,
  NULL,
  COALESCE(NULLIF(trim(s.invoice_line_description), ''), 'Repairs, IT support'),
  i.final_total
FROM invoices i
CROSS JOIN settings s
WHERE i.status IN ('draft', 'issued', 'paid')
  AND s.id = 1;
