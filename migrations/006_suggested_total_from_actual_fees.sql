-- Suggested invoice total is the sum of actual fees on uninvoiced cases for the service date.

CREATE OR REPLACE FUNCTION calculate_suggested_total(p_service_date DATE)
RETURNS NUMERIC AS $$
DECLARE
  fee_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(actual_fee), 0) INTO fee_total
  FROM cases
  WHERE exam_date = p_service_date
    AND invoice_id IS NULL;

  RETURN fee_total;
END;
$$ LANGUAGE plpgsql STABLE;
