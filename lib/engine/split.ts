// Immediate-funding capacity. Expected future pay cannot authorize a transfer today.
import type { FinancialPicture, HealthResult } from '../types';
import { money0, shortDate } from '../format';
import { addDays } from './dates';
import { scoreHealth } from './health';
import { forecastBalance } from './forecast';
import { checkSource } from './source';
import { validDate } from './validation';
import { daysBetween } from './dates';

export const weeksUntil = (asOf: string, date: string): number => Math.max(1, Math.floor(daysBetween(asOf, date) / 7));
export interface Pledge { amount: number; sourceAccountId: string; goalId?: string }
export interface PledgeCheck {
  passed: boolean; // the money exists today, so the pledge can be made
  safe: boolean; // and it also keeps this person green with their bills covered
  scoreBefore: number | null; scoreAfter: number | null; reason: string;
  warning?: string | null; // why they shouldn't, when passed but not safe
}

/** Names the real bill at stake: "you still need to pay Rent", not just a score. */
function pledgeWarning(p: FinancialPicture, pledge: Pledge, after: HealthResult, low: { balance: number; date: string } | undefined, asOf: string): string {
  const account = p.accounts.find((a) => a.id === pledge.sourceAccountId);
  const soon = addDays(asOf, 30);
  const bill = p.obligations.filter((o) => o.essential && o.nextDate >= asOf && o.nextDate <= soon).sort((a, b) => b.amount - a.amount || a.nextDate.localeCompare(b.nextDate))[0];
  const owed = bill ? ` You still need to pay ${bill.name} (${money0(bill.amount)}, due ${shortDate(bill.nextDate)}),` : '';
  const effect = low && low.balance < 0
    ? ` this would take ${account?.nickname ?? 'this account'} down to ${money0(low.balance)} by ${shortDate(low.date)}.`
    : ` this leaves your health score at ${after.score} (${after.overall}).`;
  if (bill) return `We’d advise against this.${owed} and${effect}`;
  const worst = after.indicators.filter((i) => i.status !== 'green').sort((a, b) => b.weight - a.weight)[0];
  return `We’d advise against this:${effect}${worst ? ` The biggest concern is ${worst.label.toLowerCase()}.` : ''}`;
}
export function checkPledge(p: FinancialPicture, pledge: Pledge, targetDate: string, asOf: string): PledgeCheck {
  const before = scoreHealth(p, { asOf });
  const source = checkSource(p, pledge.amount, pledge.sourceAccountId, pledge.goalId);
  const after = scoreHealth(p, { asOf, changes: [{ kind: 'oneTime', amount: pledge.amount, sourceAccountId: pledge.sourceAccountId, goalId: pledge.goalId, label: 'Immediate Huddle contribution' }] });
  const account = p.accounts.find((a) => a.id === pledge.sourceAccountId && a.ownerMemberId === p.memberId);
  const available = (account?.balance ?? 0) - p.reservations.filter((r) => r.sourceAccountId === pledge.sourceAccountId).reduce((s, r) => s + r.amount, 0);
  const forecast = forecastBalance(p, { asOf, changes: [{ kind: 'oneTime', amount: pledge.amount, sourceAccountId: pledge.sourceAccountId, label: 'Contribution' }] });
  const low = forecast.lowestByAccount[pledge.sourceAccountId];
  const hasMoney = !!account && pledge.amount <= available;
  const valid = source.valid && before.missingInputs.length === 0 && after.missingInputs.length === 0 && validDate(targetDate) && targetDate >= asOf;
  const passed = valid && hasMoney; // a risky pledge is the person's call; money that isn't there isn't
  const safe = passed && (low?.balance ?? -1) >= 0 && after.overall === 'green';
  const warning = passed && !safe ? pledgeWarning(p, pledge, after, low, asOf) : null;
  return { passed, safe, warning, scoreBefore: before.score, scoreAfter: after.score,
    reason: !valid ? [...source.missingInputs, ...after.missingInputs, ...(!validDate(targetDate) || targetDate < asOf ? ['Choose a valid target date.'] : [])].join(' ')
      : !hasMoney ? (available < (account?.balance ?? 0)
        ? `Only ${money0(Math.max(0, available))} of ${account?.nickname ?? 'this account'} is free. The rest is already promised to your other huddles.`
        : 'The selected account cannot fund this contribution today alongside its existing commitments.')
      : warning ?? 'This exact account can fund the contribution today and the assessment remains green.' };
}
export function capacity(p: FinancialPicture, _targetDate: string, asOf: string): number {
  // Largest green amount from ONE checking account, never a pooled balance.
  return Math.max(0, ...p.accounts.filter((a) => a.type === 'Checking' && a.ownerMemberId === p.memberId).map((a) => {
    let low = 0, high = Math.max(0, a.balance);
    while (low < high) {
      const mid = low + Math.ceil((high - low) / 2);
      if (checkPledge(p, { amount: mid, sourceAccountId: a.id }, asOf, asOf).safe) low = mid; else high = mid - 1;
    }
    return low;
  }));
}
export function fairSplit(total: number, capacities: Record<string, number>): Record<string, number> {
  if (!Number.isSafeInteger(total) || total < 0 || Object.values(capacities).some((n) => !Number.isSafeInteger(n) || n < 0)) throw new Error('Split amounts must be nonnegative integer cents');
  const ids = Object.keys(capacities).sort();
  const sum = ids.reduce((s, id) => s + capacities[id], 0);
  // A suggestion never exceeds permitted capacities. Return a shortfall instead.
  const budget = Math.min(total, sum);
  const split = Object.fromEntries(ids.map((id) => [id, sum ? Math.floor(budget * capacities[id] / sum) : 0]));
  let remaining = budget - Object.values(split).reduce((s, n) => s + n, 0);
  for (const id of ids) if (remaining > 0 && split[id] < capacities[id]) { split[id]++; remaining--; }
  return split;
}
export const shortfall = (total: number, pledges: number[]): number => Math.max(0, total - pledges.reduce((s, p) => s + p, 0));
