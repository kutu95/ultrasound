import type { UltrasoundCase } from '../types/database';

export interface LineItemSuggestion {
  case_id: string;
  description: string;
  amount: number;
}

/**
 * Billing rule:
 * - $300 minimum covers the first 1–2 billable (non-free) exams on a date
 * - Each additional billable exam is $150
 * - Free exams contribute $0
 */
export function calculateSuggestedTotal(cases: UltrasoundCase[]): number {
  const billable = cases.filter((c) => !c.is_free);
  const count = billable.length;

  if (count === 0) return 0;
  if (count <= 2) return 300;
  return 300 + (count - 2) * 150;
}

export function calculateLineItems(cases: UltrasoundCase[]): LineItemSuggestion[] {
  const sorted = [...cases].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return sorted.map((c) => ({
    case_id: c.id,
    description: formatLineDescription(c),
    amount: c.is_free ? 0 : calculateCaseAmount(cases, c.id),
  }));
}

function calculateCaseAmount(allCases: UltrasoundCase[], caseId: string): number {
  const target = allCases.find((c) => c.id === caseId);
  if (!target || target.is_free) return 0;

  const billable = allCases
    .filter((c) => !c.is_free)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const count = billable.length;

  if (count === 1) return 300;
  return 150;
}

export function formatLineDescription(c: UltrasoundCase): string {
  return `${c.exam_date} — ${c.owner_surname} / ${c.pet_name} / ${c.species} / ${c.exam_type}`;
}

export function lineItemsSum(items: { amount: number }[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
}
