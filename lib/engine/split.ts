// Immediate-funding capacity. Expected future pay cannot authorize a transfer today.
import type { FinancialPicture } from '../types';
import { scoreHealth } from './health';
import { forecastBalance } from './forecast';
import { checkSource } from './source';
import { validDate } from './validation';
import { daysBetween } from './dates';

export const weeksUntil = (asOf: string, date: string): number => Math.max(1, Math.floor(daysBetween(asOf, date) / 7));
export interface Pledge { amount: number; sourceAccountId: string; goalId?: string }
export interface PledgeCheck {
  passed: boolean; scoreBefore: number | null; scoreAfter: number | null; reason: string;
  requiresAcknowledgement?: boolean;
}
export function checkPledge(p: FinancialPicture, pledge: Pledge, targetDate: string, asOf: string): PledgeCheck {
  const before = scoreHealth(p, { asOf });
  const source = checkSource(p, pledge.amount, pledge.sourceAccountId, pledge.goalId);
  const after = scoreHealth(p, { asOf, changes: [{ kind: 'oneTime', amount: pledge.amount, sourceAccountId: pledge.sourceAccountId, goalId: pledge.goalId, label: 'Immediate Huddle contribution' }] });
  const account = p.accounts.find((a) => a.id === pledge.sourceAccountId && a.ownerMemberId === p.memberId);
  const available = (account?.balance ?? 0) - p.reservations.filter((r) => r.sourceAccountId === pledge.sourceAccountId).reduce((s, r) => s + r.amount, 0);
  const forecast = forecastBalance(p, { asOf, changes: [{ kind: 'oneTime', amount: pledge.amount, sourceAccountId: pledge.sourceAccountId, label: 'Contribution' }] });
  const liquid = !!account && pledge.amount <= available && (forecast.lowestByAccount[pledge.sourceAccountId]?.balance ?? -1) >= 0;
  const valid = source.valid && before.missingInputs.length === 0 && after.missingInputs.length === 0 && validDate(targetDate) && targetDate >= asOf;
  const yellow = valid && liquid && after.overall === 'yellow';
  return { passed: valid && liquid && after.overall === 'green', scoreBefore: before.score, scoreAfter: after.score,
    requiresAcknowledgement: yellow,
    reason: !valid ? [...source.missingInputs, ...after.missingInputs, ...(!validDate(targetDate) || targetDate < asOf ? ['Choose a valid target date.'] : [])].join(' ')
      : !liquid ? 'The selected account cannot fund this contribution today alongside its existing commitments.'
      : yellow ? 'This contribution leaves a yellow assessment. A separate acknowledgement is required; commitment is blocked until that workflow is implemented.'
      : after.overall !== 'green' ? 'This contribution leaves a red assessment and cannot be committed.'
      : 'This exact account can fund the contribution today and the assessment remains green.' };
}
export function capacity(p: FinancialPicture, _targetDate: string, asOf: string): number {
  // Largest green amount from ONE checking account, never a pooled balance.
  return Math.max(0, ...p.accounts.filter((a) => a.type === 'Checking' && a.ownerMemberId === p.memberId).map((a) => {
    let low = 0, high = Math.max(0, a.balance);
    while (low < high) {
      const mid = low + Math.ceil((high - low) / 2);
      if (checkPledge(p, { amount: mid, sourceAccountId: a.id }, asOf, asOf).passed) low = mid; else high = mid - 1;
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
