-- Seed data for Ultrasound Ledger development
-- Run: npm run db:seed

-- Sample cases for a few dates
INSERT INTO cases (
  exam_date, owner_surname, pet_name, species, exam_type,
  findings_text, conclusion_text, image_notes,
  standard_fee, actual_fee, is_free, free_reason
) VALUES
(
  '2025-06-01', 'Smith', 'Buddy', 'Canine', 'Echocardiography',
  'Normal cardiac chambers. No pericardial effusion. Normal valve function.',
  'Normal echocardiographic examination.',
  '12 images saved to PACS',
  150.00, 150.00, false, NULL
),
(
  '2025-06-01', 'Jones', 'Mittens', 'Feline', 'Abdominal ultrasound',
  'Liver normal in size and echogenicity. Kidneys normal. Bladder empty.',
  'Normal abdominal ultrasound.',
  '8 images',
  150.00, 150.00, false, NULL
),
(
  '2025-06-08', 'Williams', 'Rex', 'Canine', 'Pregnancy diagnosis',
  'Gestational sacs visible. Minimum 4 puppies estimated.',
  'Pregnancy confirmed, approximately 4 weeks gestation.',
  '6 images',
  150.00, 150.00, false, NULL
),
(
  '2025-06-08', 'Brown', 'Luna', 'Feline', 'Abdominal ultrasound',
  'Mild bladder wall thickening. Otherwise unremarkable.',
  'Possible cystitis — correlate clinically.',
  '10 images',
  150.00, 0.00, true, 'Staff pet — complimentary'
),
(
  '2025-06-08', 'Taylor', 'Max', 'Canine', 'Echocardiography',
  'Mild mitral regurgitation. Left atrium mildly enlarged.',
  'Early degenerative mitral valve disease.',
  '14 images',
  150.00, 150.00, false, NULL
),
(
  '2025-06-08', 'Anderson', 'Coco', 'Canine', 'Other',
  'Soft tissue mass in left flank, 3.2 cm. FNA recommended.',
  'Abdominal mass identified — further workup advised.',
  '9 images',
  150.00, 150.00, false, NULL
);

INSERT INTO invoices (
  invoice_number, invoice_date, service_date,
  customer_name, customer_location,
  status, suggested_total, final_total
) VALUES (
  'INV-1001', '2025-06-02', '2025-06-01',
  'Heritage Veterinary Hospital', 'Busselton WA',
  'issued', 300.00, 300.00
);

INSERT INTO invoice_items (invoice_id, case_id, description, amount)
VALUES (
  (SELECT id FROM invoices WHERE invoice_number = 'INV-1001'),
  NULL,
  'Repairs, IT support',
  300.00
);

UPDATE cases SET invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-1001')
WHERE exam_date = '2025-06-01';

INSERT INTO payments (payment_date, amount, reference, notes)
VALUES ('2025-06-10', 200.00, 'EFT-20250610', 'Partial payment');

INSERT INTO payment_allocations (payment_id, invoice_id, amount)
SELECT
  (SELECT id FROM payments WHERE reference = 'EFT-20250610'),
  (SELECT id FROM invoices WHERE invoice_number = 'INV-1001'),
  200.00;

UPDATE settings SET
  supplier_name = 'Your Name / Business Name',
  supplier_abn = 'XX XXX XXX XXX',
  bank_account_name = 'Your Account Name',
  bsb = '000-000',
  account_number = '00000000',
  gst_registered = false;
