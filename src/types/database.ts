export type ExamType =
  | 'Echocardiography'
  | 'Abdominal ultrasound'
  | 'Pregnancy diagnosis'
  | 'Other';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface Settings {
  id: number;
  supplier_name: string;
  supplier_abn: string;
  bank_account_name: string;
  bsb: string;
  account_number: string;
  gst_registered: boolean;
  default_customer_name: string;
  default_customer_location: string;
  invoice_line_description: string;
  updated_at: string;
}

export interface UltrasoundCase {
  id: string;
  exam_date: string;
  owner_surname: string;
  pet_name: string;
  species: string;
  exam_type: ExamType;
  /** Full ultrasound report text (stored in findings_text). */
  findings_text: string;
  /** Short scan label, e.g. "suspect spleen" (stored in conclusion_text). */
  conclusion_text: string;
  image_notes: string;
  standard_fee: number;
  actual_fee: number;
  is_free: boolean;
  free_reason: string | null;
  billing_note: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseImage {
  id: string;
  case_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
  url: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  service_date: string;
  customer_name: string;
  customer_location: string;
  status: InvoiceStatus;
  suggested_total: number;
  final_total: number;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  case_id: string | null;
  description: string;
  amount: number;
}

export interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  reference: string;
  notes: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
}

export interface InvoiceBalance {
  id: string;
  invoice_number: string;
  invoice_date: string;
  service_date: string;
  customer_name: string;
  status: InvoiceStatus;
  final_total: number;
  paid_amount: number;
  outstanding: number;
}

export interface StatementEntry {
  entry_date: string;
  entry_type: 'invoice' | 'payment';
  reference_id: string;
  reference_label: string;
  debit: number;
  credit: number;
  created_at: string;
}

export interface StatementResult {
  from_date: string;
  to_date: string;
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
  entries: StatementEntry[];
}

export interface CaseFormData {
  exam_date: string;
  owner_surname: string;
  pet_name: string;
  species: string;
  exam_type: ExamType;
  /** Full ultrasound report text (stored in findings_text). */
  findings_text: string;
  /** Short scan label, e.g. "suspect spleen" (stored in conclusion_text). */
  conclusion_text: string;
  image_notes: string;
  standard_fee: number;
  actual_fee: number;
  is_free: boolean;
  free_reason: string;
  billing_note: string;
}

export const EXAM_TYPES: ExamType[] = [
  'Echocardiography',
  'Abdominal ultrasound',
  'Pregnancy diagnosis',
  'Other',
];

export const DEFAULT_CASE_FORM: CaseFormData = {
  exam_date: new Date().toISOString().slice(0, 10),
  owner_surname: '',
  pet_name: '',
  species: 'dog',
  exam_type: 'Echocardiography',
  findings_text: '',
  conclusion_text: '',
  image_notes: '',
  standard_fee: 150,
  actual_fee: 150,
  is_free: false,
  free_reason: '',
  billing_note: '',
};
