import type { AffordResult, FinancialPicture, ForecastPoint, MoneyCents } from '../types';
import { shortDate } from '../format';
import { canAfford, purchaseOk, type AffordQuestion } from './afford';
import { daysBetween } from './dates';
import { forecastBalance } from './forecast';
import { scoreHealth } from './health';
import { validCents } from './money';
import { checkSource } from './source';
import { validDate } from './validation';

export const MAX_PURCHASES = 10;

/** Sum validated purchase cents without rounding or exceeding the supported range. */
export function purchaseTotal(purchases: readonly Pick<AffordQuestion, 'cost'>[]): MoneyCents | null {
  let total = 0;
  for (const { cost } of purchases) {
    if (!validCents(cost) || cost <= 0 || cost > Number.MAX_SAFE_INTEGER - total) return null;
    total += cost;
  }
  return total;
}

/** Reserve committed cash and consume only the goal allocation that commitment names. */
function afterSavingsReservations(p: FinancialPicture, sourceAccountId: string): FinancialPicture | null {
  const account = p.accounts.find((candidate) => candidate.id === sourceAccountId && candidate.ownerMemberId === p.memberId && candidate.type === 'Savings');
  if (!account) return p;
  const reservations = p.reservations.filter((reservation) => reservation.sourceAccountId === sourceAccountId);
  let reserved = 0;
  const byGoal = new Map<string, number>();
  for (const reservation of reservations) {
    if (!validCents(reservation.amount) || reservation.amount > Number.MAX_SAFE_INTEGER - reserved) return null;
    reserved += reservation.amount;
    if (reservation.goalId) byGoal.set(reservation.goalId, (byGoal.get(reservation.goalId) ?? 0) + reservation.amount);
  }
  const balance = account.balance - reserved;
  if (!Number.isSafeInteger(balance)) return null;
  return { ...p,
    accounts: p.accounts.map((candidate) => candidate.id === sourceAccountId ? { ...candidate, balance } : candidate),
    goals: p.goals.map((goal) => goal.accountId === sourceAccountId ? { ...goal, amount: Math.max(0, goal.amount - (byGoal.get(goal.id) ?? 0)) } : goal),
    // These reservations have already been applied to this validation-only snapshot.
    reservations: p.reservations.filter((reservation) => reservation.sourceAccountId !== sourceAccountId),
  };
}

function lowUntilPayday(points: ForecastPoint[], date: string): AffordResult['lowUntilPayday'] {
  const from = points.filter((point) => point.date >= date);
  if (!from.length) return undefined;
  let left = from[0].balance;
  let payday: string | null = null;
  for (let i = 1; i < from.length; i++) {
    if (from[i].balance > from[i - 1].balance) { payday = from[i].date; break; }
    left = Math.min(left, from[i].balance);
  }
  return left >= 0 && left < 50_000 ? { left, payday } : undefined;
}

/** Assess a dated basket as one commitment against its exact funding account. */
export function canAffordPurchases(p: FinancialPicture, purchases: readonly AffordQuestion[], asOf: string): AffordResult {
  // Keep every existing single-purchase decision, explanation and alternative unchanged.
  if (purchases.length === 1) return canAfford(p, purchases[0], asOf);

  const sourceAccountId = purchases[0]?.sourceAccountId ?? '';
  const goalId = purchases[0]?.goalId;
  const missing: string[] = [];
  if (!purchases.length || purchases.length > MAX_PURCHASES) missing.push(`Add between 1 and ${MAX_PURCHASES} purchases.`);
  if (purchases.some((purchase) => purchase.sourceAccountId !== sourceAccountId || purchase.goalId !== goalId)) {
    missing.push('Choose the same source account and savings goal for every purchase.');
  }
  const total = purchaseTotal(purchases);
  if (total === null) missing.push('Enter positive purchase amounts in cents within the supported calculation range.');
  for (const purchase of purchases) {
    missing.push(...checkSource(p, purchase.cost, purchase.sourceAccountId, purchase.goalId).missingInputs);
    const date = purchase.date ?? asOf;
    const interval = validDate(date) && validDate(asOf) ? daysBetween(asOf, date) : -1;
    if (interval < 0 || interval > 335) missing.push('Choose a valid purchase date from today through the next 335 days.');
  }
  // Separately checking items can reuse allocated or already committed money.
  if (total !== null && total > 0) {
    const available = afterSavingsReservations(p, sourceAccountId);
    if (!available) missing.push('Amounts exceed the supported calculation range.');
    else missing.push(...checkSource(available, total, sourceAccountId, goalId).missingInputs);
  }

  const before = scoreHealth(p, { asOf });
  const evaluate = (items: readonly AffordQuestion[]) => {
    const latest = items.reduce((date, item) => (item.date ?? asOf) > date ? (item.date ?? asOf) : date, asOf);
    const days = Math.max(30, daysBetween(asOf, latest) + 30);
    const changes = items.map((item) => ({ kind: 'oneTime' as const, amount: item.cost, sourceAccountId,
      goalId, date: item.date ?? asOf, label: item.label }));
    const after = scoreHealth(p, { asOf, changes, days });
    const forecast = forecastBalance(p, { asOf, changes, days });
    const low = forecast.lowestByAccount[sourceAccountId];
    const account = p.accounts.find((candidate) => candidate.id === sourceAccountId && candidate.ownerMemberId === p.memberId);
    const reserved = p.reservations.filter((reservation) => reservation.sourceAccountId === sourceAccountId).reduce((sum, reservation) => sum + reservation.amount, 0);
    const cashNow = account ? account.balance - reserved : 0;
    const dueToday = purchaseTotal(items.filter((item) => (item.date ?? asOf) === asOf));
    const liquid = !!low && low.balance >= 0 && dueToday !== null && (dueToday === 0 ||
      (Number.isSafeInteger(reserved) && Number.isSafeInteger(cashNow) && dueToday <= cashNow));
    return { after, liquid, low, points: forecast.byAccount[sourceAccountId] };
  };
  const evaluated = missing.length ? undefined : evaluate(purchases);
  const after = evaluated?.after ?? before;
  const liquid = evaluated?.liquid ?? false;
  const missingInputs = [...new Set([...missing, ...before.missingInputs, ...after.missingInputs])];
  const earliest = purchases.reduce((date, purchase) => (purchase.date ?? asOf) < date ? (purchase.date ?? asOf) : date, purchases[0]?.date ?? asOf);
  const fromChecking = p.accounts.some((account) => account.id === sourceAccountId && account.type === 'Checking');
  const thin = fromChecking && evaluated?.points && !missingInputs.length ? lowUntilPayday(evaluated.points, earliest) : undefined;
  const base = { scoreBefore: before.score, scoreAfter: after.score, flags: after.flags, missingInputs, sourceAccountId, liquid,
    ...(thin ? { lowUntilPayday: thin } : {}), before, after };
  if (missingInputs.length) return { ...base, verdict: 'no', reason: missingInputs.join(' ') };
  if (liquid && purchaseOk(before, after)) return { ...base, verdict: 'yes',
    reason: 'The selected account covers all purchases, scheduled expenses and existing commitments, and the resulting assessment is green.' };

  const problem = !liquid
    ? `The selected account cannot cover all purchases and its commitments${evaluated?.low ? ` (lowest balance on ${shortDate(evaluated.low.date)})` : ''}.`
    : 'The resulting assessment is not green.';
  const payday = p.paycheck?.accountId === sourceAccountId ? p.paycheck.nextDate : undefined;
  if (payday && payday > earliest && daysBetween(asOf, payday) <= 335) {
    const delayed = purchases.map((purchase) => (purchase.date ?? asOf) < payday ? { ...purchase, date: payday } : purchase);
    const later = evaluate(delayed);
    if (later.liquid && purchaseOk(before, later.after)) return { ...base, verdict: 'yesIf', readyDate: payday,
      reason: `${problem} Moving earlier purchases to the ${shortDate(payday)} deposit, with later purchases unchanged, produces a verified green assessment.`,
      verifiedAlternative: { date: payday, sourceAccountId, result: later.after } };
  }
  return { ...base, verdict: 'no', reason: `${problem} No verified green alternative was found in the checked scenarios.` };
}
