// detectPaychecks + detectRecurring: find patterns in a person's transactions.
// Pure functions: same transactions in → same result out. No network, no AI.

import type { Obligation, Paycheck, Txn } from '../types';
import { isEssential } from './categories';
import { addDays, addMonths, daysBetween, nextSemiMonthly } from './dates';

const AMOUNT_TOLERANCE = 0.1; // amounts within ±10% of the median count as "the same"

// ---------- small helpers ----------

export function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function roundCents(n: number): number {
  return Math.round(n);
}

// "ACME CORP PAYROLL #4471" and "Acme Corp Payroll 4512" → "acme corp payroll"
export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Groups in a stable (alphabetical) order so results never depend on input order.
function groupSorted(txns: Txn[], labelOf: (t: Txn) => string): [string, Txn[]][] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const normalized = labelOf(t);
    if (!normalized) continue;
    const label = `${t.accountId}|${normalized}`;
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([label, group]) => [label, sortByDate(group)]);
}

function sortByDate(txns: Txn[]): Txn[] {
  return [...txns].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

function gapsInDays(sorted: Txn[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
  return gaps;
}

function amountsConsistent(amounts: number[]): boolean {
  const m = median(amounts);
  return amounts.every((a) => Math.abs(a - m) <= m * AMOUNT_TOLERANCE);
}

// ---------- detectPaychecks ----------

const PAY_CADENCES = [7, 14, 15, 30]; // weekly, biweekly, semi-monthly, monthly

/**
 * Finds the person's main paycheck: repeated deposits with the same description,
 * similar amounts, on a regular schedule. If several qualify, the biggest total wins.
 * `asOf` (YYYY-MM-DD) rolls nextDate forward so it's always in the future.
 */
export function detectPaychecks(txns: Txn[], asOf?: string): Paycheck | null {
  const deposits = txns.filter((t) => t.kind === 'deposit' && t.amount > 0);
  let best: { total: number; paycheck: Paycheck } | null = null;

  for (const [, group] of groupSorted(deposits, (t) => normalizeLabel(t.description))) {
    if (group.length < 2) continue;
    const amounts = group.map((t) => t.amount);
    if (!amountsConsistent(amounts)) continue;

    const typicalGap = median(gapsInDays(group));
    // closest schedule wins (a 15-day gap is semi-monthly, not biweekly)
    const [cadence] = PAY_CADENCES.filter((c) => Math.abs(typicalGap - c) <= 3).sort(
      (a, b) => Math.abs(typicalGap - a) - Math.abs(typicalGap - b),
    );
    if (cadence === undefined) continue;

    const observedDays = [...new Set(group.map((t) => { const day = Number(t.date.slice(8)); return day >= 28 ? 31 : day; }))].sort((a, b) => a - b);
    const semiMonthlyDays: [number, number] | undefined = cadence === 15 && observedDays.length === 2 ? [observedDays[0], observedDays[1]] : undefined;
    const step = (d: string) => cadence === 15 && semiMonthlyDays ? nextSemiMonthly(d, semiMonthlyDays) : cadence === 30 ? addMonths(d, 1) : addDays(d, cadence);
    let nextDate = step(group[group.length - 1].date);
    if (asOf) while (nextDate <= asOf) nextDate = step(nextDate);

    const total = amounts.reduce((a, b) => a + b, 0);
    if (!best || total > best.total) {
      best = {
        total,
        paycheck: { accountId: group[0].accountId, ...(semiMonthlyDays ? { semiMonthlyDays } : {}), avgAmount: roundCents(total / amounts.length), cadenceDays: cadence, nextDate },
      };
    }
  }
  return best ? best.paycheck : null;
}

// ---------- detectRecurring ----------

// minCount: 60 days of history only shows a monthly charge twice, but two coffees 2 weeks
// apart aren't a subscription, so weekly/biweekly need at least 3 charges.
const RECURRING_CADENCES: { days: number; cadence: Obligation['cadence']; slack: number; minCount: number }[] = [
  { days: 7, cadence: 'weekly', slack: 1, minCount: 3 },
  { days: 14, cadence: 'biweekly', slack: 2, minCount: 3 },
  { days: 30, cadence: 'monthly', slack: 3, minCount: 2 }, // months are 28–31 days
];

/**
 * Finds subscriptions and repeating bills paid by card: the same merchant charged
 * at least twice, similar amounts, every gap matching weekly / biweekly / monthly.
 * Groceries at the same store don't match because amounts and gaps vary.
 */
export function detectRecurring(txns: Txn[], asOf?: string): Obligation[] {
  const purchases = txns.filter((t) => t.kind === 'purchase' && t.amount > 0);
  const found: Obligation[] = [];

  for (const [label, group] of groupSorted(purchases, (t) => normalizeLabel(t.merchant ?? t.description))) {
    if (group.length < 2) continue;
    const amounts = group.map((t) => t.amount);
    if (!amountsConsistent(amounts)) continue;

    const gaps = gapsInDays(group);
    const match = RECURRING_CADENCES.find(
      (r) => group.length >= r.minCount && gaps.every((g) => Math.abs(g - r.days) <= r.slack),
    );
    if (!match) continue;

    const last = group[group.length - 1];
    const step = (d: string) => (match.cadence === 'monthly' ? addMonths(d, 1) : addDays(d, match.days));
    let nextDate = step(last.date);
    if (asOf) while (nextDate <= asOf) nextDate = step(nextDate);

    const name = last.merchant ?? last.description;
    found.push({
      key: `detected:${label.replace(/ /g, '-')}`,
      accountId: last.accountId,
      name,
      amount: roundCents(median(amounts)),
      nextDate,
      cadence: match.cadence,
      essential: isEssential(last.category, name),
      origin: 'detected',
    });
  }
  return found;
}
