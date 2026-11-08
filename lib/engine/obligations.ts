// buildObligations: one list of everything a person pays regularly
// (bills + loans + detected subscriptions), tagged essential / non-essential.
// Pure function: same inputs → same list, same order.

import type { Bill, Loan, Obligation, ObligationTag } from '../types';
import { isEssential } from './categories';
import { normalizeLabel } from './detect';

function roundCents(n: number): number {
  return Math.round(n);
}

// "car" → "Car loan", "Student Loan" → "Student Loan"
function loanName(type: string): string {
  const t = type.trim();
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /loan/i.test(t) ? capped : `${capped} loan`;
}

// "t mobile usa" and "t mobile" are the same payee
function samePayee(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

export function buildObligations(
  bills: Bill[],
  loans: Loan[],
  recurring: Obligation[],
  tags: ObligationTag[] = [],
): Obligation[] {
  // 1. Bills and loans → Obligation shape, with default essential tags
  const fromBills: Obligation[] = bills.map((b) => ({
    key: `bill:${b.id}`,
    accountId: b.accountId,
    name: b.payee,
    amount: roundCents(b.amount),
    nextDate: b.nextDate,
    cadence: b.cadence ?? 'monthly',
    essential: isEssential(b.category, b.payee),
    origin: 'bill',
  }));

  const fromLoans: Obligation[] = loans.map((l) => ({
    key: `loan:${l.id}`,
    accountId: l.accountId,
    name: loanName(l.type),
    amount: roundCents(l.monthlyPayment),
    nextDate: l.nextDate,
    cadence: 'monthly',
    essential: true, // a missed loan payment always hurts
    origin: 'loan',
  }));

  // 2. Drop detected card charges that are really one of those bills
  //    (otherwise the phone bill gets counted twice). The bill wins.
  const known = [...fromBills, ...fromLoans];
  const detected = recurring.filter((o) => {
    const label = normalizeLabel(o.name);
    return !known.some((k) => k.accountId === o.accountId && k.amount === o.amount && k.nextDate === o.nextDate && samePayee(normalizeLabel(k.name), label));
  });

  // 3. The user's own tags always win
  const overrides = new Map(tags.map((t) => [t.obligationKey, t.essential]));

  // 4. Stable order: by due date, then key
  return [...fromBills, ...fromLoans, ...detected]
    .map((o) => (overrides.has(o.key) ? { ...o, essential: overrides.get(o.key) as boolean } : o))
    .sort((a, b) =>
      a.nextDate !== b.nextDate ? (a.nextDate < b.nextDate ? -1 : 1) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    );
}
