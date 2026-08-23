const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? 'Request failed', res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthUser {
  username: string;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<AuthUser> {
  return apiFetch('/api/auth/me');
}

// Re-export domain API from same module pattern
import type {
  CaseFormData,
  CaseImage,
  Invoice,
  InvoiceBalance,
  InvoiceItem,
  Payment,
  PaymentAllocation,
  Settings,
  StatementResult,
  UltrasoundCase,
} from '../types/database';

export type { CaseImage };

export async function fetchSettings(): Promise<Settings | null> {
  return apiFetch('/api/settings');
}

export async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  return apiFetch('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function fetchCases(filters?: {
  exam_date?: string;
  uninvoiced_only?: boolean;
}): Promise<UltrasoundCase[]> {
  const params = new URLSearchParams();
  if (filters?.exam_date) params.set('exam_date', filters.exam_date);
  if (filters?.uninvoiced_only) params.set('uninvoiced_only', 'true');
  const qs = params.toString();
  return apiFetch(`/api/cases${qs ? `?${qs}` : ''}`);
}

export async function fetchCase(id: string): Promise<UltrasoundCase | null> {
  return apiFetch(`/api/cases/${id}`);
}

export async function createCase(form: CaseFormData): Promise<UltrasoundCase> {
  return apiFetch('/api/cases', { method: 'POST', body: JSON.stringify(form) });
}

export async function updateCase(id: string, form: CaseFormData): Promise<UltrasoundCase> {
  return apiFetch(`/api/cases/${id}`, { method: 'PUT', body: JSON.stringify(form) });
}

export async function deleteCase(id: string): Promise<void> {
  await apiFetch(`/api/cases/${id}`, { method: 'DELETE' });
}

export async function fetchCaseImages(caseId: string): Promise<CaseImage[]> {
  return apiFetch(`/api/cases/${caseId}/images`);
}

export async function uploadCaseImages(caseId: string, files: File[]): Promise<CaseImage[]> {
  const body = new FormData();
  for (const file of files) {
    body.append('images', file);
  }

  const res = await fetch(`${API_BASE}/api/cases/${caseId}/images`, {
    method: 'POST',
    credentials: 'include',
    body,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(payload.error ?? 'Upload failed', res.status);
  }

  return res.json() as Promise<CaseImage[]>;
}

export async function deleteCaseImage(caseId: string, imageId: string): Promise<void> {
  await apiFetch(`/api/cases/${caseId}/images/${imageId}`, { method: 'DELETE' });
}

export async function fetchInvoices(): Promise<Invoice[]> {
  return apiFetch('/api/invoices');
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  return apiFetch(`/api/invoices/${id}`);
}

export async function fetchInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  return apiFetch(`/api/invoices/${invoiceId}/items`);
}

export async function fetchInvoiceBalances(): Promise<InvoiceBalance[]> {
  return apiFetch('/api/invoices/balances');
}

export async function createDraftInvoice(serviceDate: string): Promise<Invoice> {
  return apiFetch('/api/invoices/draft', {
    method: 'POST',
    body: JSON.stringify({ service_date: serviceDate }),
  });
}

export async function fetchInvoiceCases(invoiceId: string): Promise<UltrasoundCase[]> {
  return apiFetch(`/api/invoices/${invoiceId}/cases`);
}

export async function issueInvoice(
  invoiceId: string,
  caseIds: string[],
  lineDescription: string,
  finalTotal: number,
  overrideReason: string | null,
): Promise<Invoice> {
  return apiFetch(`/api/invoices/${invoiceId}/issue`, {
    method: 'POST',
    body: JSON.stringify({
      case_ids: caseIds,
      line_description: lineDescription,
      final_total: finalTotal,
      override_reason: overrideReason,
    }),
  });
}

export async function voidInvoice(id: string): Promise<void> {
  await apiFetch(`/api/invoices/${id}/void`, { method: 'POST' });
}

export async function fetchPayments(): Promise<Payment[]> {
  return apiFetch('/api/payments');
}

export async function fetchAllAllocations(): Promise<PaymentAllocation[]> {
  return apiFetch('/api/payments/allocations');
}

export async function createPayment(payment: {
  payment_date: string;
  amount: number;
  reference: string;
  notes?: string;
  allocations?: { invoice_id: string; amount: number }[];
}): Promise<Payment> {
  return apiFetch('/api/payments', {
    method: 'POST',
    body: JSON.stringify(payment),
  });
}

export async function fetchStatement(filters: {
  from_date: string;
  to_date: string;
}): Promise<StatementResult> {
  const params = new URLSearchParams({
    from_date: filters.from_date,
    to_date: filters.to_date,
  });
  return apiFetch(`/api/statement?${params}`);
}

export async function fetchRecentCases(limit = 10): Promise<UltrasoundCase[]> {
  return apiFetch(`/api/cases/recent?limit=${limit}`);
}

export async function fetchRecentPayments(limit = 10): Promise<Payment[]> {
  return apiFetch(`/api/payments/recent?limit=${limit}`);
}

export async function fetchUnpaidInvoices(): Promise<InvoiceBalance[]> {
  return apiFetch('/api/dashboard/unpaid-invoices');
}

export async function fetchTotalOutstanding(): Promise<number> {
  const data = await apiFetch<{ total: number }>('/api/dashboard/outstanding');
  return data.total;
}
