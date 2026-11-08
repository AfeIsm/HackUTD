// dataHash: a fingerprint of someone's money data.
// Same accounts/transactions/bills/goals → same hash, in any order.
// If the hash hasn't changed, we reuse the saved fix plan instead of asking the AI again.

import type { FinancialPicture } from '../types';

// JSON with object keys sorted, so key order never changes the output
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// FNV-1a, 32-bit. Two different seeds → 16 hex chars. Plenty for change detection.
function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function sortedBy<T>(items: T[], keyOf: (t: T) => string): T[] {
  return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

export function dataHash(picture: FinancialPicture): string {
  const normalized = {
    memberId: picture.memberId,
    accounts: sortedBy(picture.accounts, (a) => a.id),
    txns: sortedBy(picture.txns, (t) => t.id),
    obligations: sortedBy(picture.obligations, (o) => o.key),
    paycheck: picture.paycheck,
    goals: sortedBy(picture.goals, (g) => g.id),
  };
  const text = stableStringify(normalized);
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x9e3779b9);
}
