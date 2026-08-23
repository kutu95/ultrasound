import type { cases, invoices, invoiceItems, payments, paymentAllocations, settings } from '../db/schema.js';
import { toISODateString } from './dates.js';

export function serializeSettings(row: typeof settings.$inferSelect) {
  return {
    id: row.id,
    supplier_name: row.supplierName,
    supplier_abn: row.supplierAbn,
    bank_account_name: row.bankAccountName,
    bsb: row.bsb,
    account_number: row.accountNumber,
    gst_registered: row.gstRegistered,
    default_customer_name: row.defaultCustomerName,
    default_customer_location: row.defaultCustomerLocation,
    invoice_line_description: row.invoiceLineDescription,
    updated_at: row.updatedAt.toISOString(),
  };
}

export function serializeCase(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    exam_date: toISODateString(row.examDate),
    owner_surname: row.ownerSurname,
    pet_name: row.petName,
    species: row.species,
    exam_type: row.examType,
    findings_text: row.findingsText,
    conclusion_text: row.conclusionText,
    image_notes: row.imageNotes,
    standard_fee: row.standardFee,
    actual_fee: row.actualFee,
    is_free: row.isFree,
    free_reason: row.freeReason,
    billing_note: row.billingNote,
    invoice_id: row.invoiceId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function serializeInvoice(row: typeof invoices.$inferSelect) {
  return {
    id: row.id,
    invoice_number: row.invoiceNumber,
    invoice_date: toISODateString(row.invoiceDate),
    service_date: toISODateString(row.serviceDate),
    customer_name: row.customerName,
    customer_location: row.customerLocation,
    status: row.status,
    suggested_total: row.suggestedTotal,
    final_total: row.finalTotal,
    override_reason: row.overrideReason,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function serializeInvoiceItem(row: typeof invoiceItems.$inferSelect) {
  return {
    id: row.id,
    invoice_id: row.invoiceId,
    case_id: row.caseId,
    description: row.description,
    amount: row.amount,
  };
}

export function serializePayment(row: typeof payments.$inferSelect) {
  return {
    id: row.id,
    payment_date: toISODateString(row.paymentDate),
    amount: row.amount,
    reference: row.reference,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
  };
}

export function serializeAllocation(row: typeof paymentAllocations.$inferSelect) {
  return {
    id: row.id,
    payment_id: row.paymentId,
    invoice_id: row.invoiceId,
    amount: row.amount,
  };
}

// Raw view row shapes
export function serializeInvoiceBalance(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    invoice_number: row.invoice_number as string,
    invoice_date: toISODateString(row.invoice_date),
    service_date: toISODateString(row.service_date),
    customer_name: row.customer_name as string,
    status: row.status as string,
    final_total: Number(row.final_total),
    paid_amount: Number(row.paid_amount),
    outstanding: Number(row.outstanding),
  };
}

export function serializeStatementEntry(row: Record<string, unknown>) {
  return {
    entry_date: toISODateString(row.entry_date),
    entry_type: row.entry_type as 'invoice' | 'payment',
    reference_id: row.reference_id as string,
    reference_label: row.reference_label as string,
    debit: Number(row.debit),
    credit: Number(row.credit),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}
