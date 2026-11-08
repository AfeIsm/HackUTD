import type { AffordResult, FinancialPicture, HealthResult } from '../types';
import { shortDate } from '../format';
import { daysBetween } from './dates';
import { forecastBalance } from './forecast';
import { scoreHealth } from './health';
import { checkSource } from './source';
import { validDate } from './validation';

export interface AffordQuestion { label: string; cost: number; date?: string; sourceAccountId: string; goalId?: string }
export function purchaseOk(_before: HealthResult, after: HealthResult): boolean {
  return after.overall === 'green' && after.missingInputs.length === 0;
}
/**
 * Is this offer worth showing? A yes counts. So does paying for it without dropping a status, or a
 * yellow-status shopper would never be shown anything. Red is never acceptable.
 */
export function fitsBudget(r: AffordResult): boolean {
  if (r.verdict !== 'no') return true;
  return r.missingInputs.length === 0 && r.liquid && r.after.overall !== 'red' && r.after.overall === r.before.overall;
}
export function canAfford(p: FinancialPicture, q: AffordQuestion, asOf: string): AffordResult {
  const date = q.date ?? asOf;
  const source = checkSource(p, q.cost, q.sourceAccountId, q.goalId);
  const missing = [...source.missingInputs];
  const interval = validDate(date) && validDate(asOf) ? daysBetween(asOf, date) : -1;
  if (interval < 0 || interval > 335) missing.push('Choose a valid purchase date from today through the next 335 days.');
  const before = scoreHealth(p, { asOf });
  const evaluate = (on: string) => {
    const days = Math.max(30, daysBetween(asOf, on) + 30);
    const changes = [{ kind: 'oneTime' as const, amount: q.cost, sourceAccountId: q.sourceAccountId, goalId: q.goalId, date: on, label: q.label }];
    const after = scoreHealth(p, { asOf, changes, days });
    const f = forecastBalance(p, { asOf, changes, days });
    const low = f.lowestByAccount[q.sourceAccountId];
    const account = p.accounts.find((a) => a.id === q.sourceAccountId);
    const cashNow = account ? account.balance - p.reservations.filter((r) => r.sourceAccountId === account.id).reduce((s, r) => s + r.amount, 0) : 0;
    const liquid = !!low && low.balance >= 0 && (on !== asOf || q.cost <= cashNow);
    return { after, liquid, low };
  };
  const { after, liquid, low } = interval >= 0 && interval <= 335 && source.valid ? evaluate(date) : { after: before, liquid: false, low: undefined };
  const missingInputs = [...new Set([...missing, ...before.missingInputs, ...after.missingInputs])];
  const base = { scoreBefore: before.score, scoreAfter: after.score, flags: after.flags, missingInputs, sourceAccountId: q.sourceAccountId, liquid, before, after };
  if (missingInputs.length) return { ...base, verdict: 'no', reason: missingInputs.join(' ') };
  if (liquid && purchaseOk(before, after)) return { ...base, verdict: 'yes', reason: 'The selected account covers this purchase, scheduled expenses and existing commitments, and the resulting assessment is green.' };
  const problem = !liquid ? `The selected account cannot cover this purchase and its commitments${low ? ` (lowest balance on ${shortDate(low.date)})` : ''}.` : 'The resulting assessment is not green.';
  // Try one explicitly verified alternative on the SAME account. Never claim a
  // long save-up plan works after simulating only its first 30 days.
  const payday = p.paycheck?.accountId === q.sourceAccountId ? p.paycheck.nextDate : undefined;
  if (payday && payday > date && daysBetween(asOf, payday) <= 335) {
    const later = evaluate(payday);
    if (later.liquid && purchaseOk(before, later.after)) return { ...base, verdict: 'yesIf', reason: `${problem} Buying after the ${shortDate(payday)} deposit on this same account produces a verified green assessment.`, readyDate: payday,
      verifiedAlternative: { date: payday, sourceAccountId: q.sourceAccountId, result: later.after } };
  }
  return { ...base, verdict: 'no', reason: `${problem} No verified green alternative was found in the checked scenarios.` };
}
