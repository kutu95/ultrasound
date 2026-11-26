import type { UltrasoundCase } from '../types/database';

export interface LineItemSuggestion {
  case_id: string;
  description: string;
  amount: number;
}

/** Suggested invoice total is the sum of each case's actual fee. */
export function calculateSuggestedTotal(cases: UltrasoundCase[]): number {
  const cents = cases.reduce((sum, c) => sum + Math.round(Number(c.actual_fee) * 100), 0);
  return cents / 100;
}

export function calculateLineItems(cases: UltrasoundCase[]): LineItemSuggestion[] {
  const sorted = [...cases].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return sorted.map((c) => ({
    case_id: c.id,
    description: formatLineDescription(c),
    amount: Math.round(Number(c.actual_fee) * 100) / 100,
  }));
}

export function formatLineDescription(c: UltrasoundCase): string {
  return `${c.exam_date} — ${c.owner_surname} / ${c.pet_name} / ${c.species} / ${c.exam_type}`;
}

export function lineItemsSum(items: { amount: number }[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
}
