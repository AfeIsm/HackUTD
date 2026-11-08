import type { Change, FinancialPicture, HealthResult, Indicator, IndicatorKey, Obligation, Status } from '../types';
import { money, money0, shortDate } from '../format';
import { addDays } from './dates';
import { forecastBalance } from './forecast';
import { dataHash } from './hash';
import { EMERGENCY_SAVINGS_FLAG, checkSource, freeSavings, savingsBalance } from './source';
import { financialInputs } from './validation';

export const ENGINE_VERSION = '2-account-cents';
export const POLICY_VERSION = 'readme-2026-11-07';
export interface ScoreOptions { asOf: string; changes?: Change[]; trigger?: string; checkedAt?: string; days?: number }
const POINTS: Record<Status, 0 | 50 | 100 | null> = { green: 100, yellow: 50, red: 0, needsInput: null };
const PAY_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };
export function monthly(o: Obligation): number {
  return Math.round(o.amount * (o.cadence === 'weekly' ? 52 / 12 : o.cadence === 'biweekly' ? 26 / 12 : 1));
}
function indicator(key: IndicatorKey, label: string, weight: number, value: number, display: string, status: Status, explanation: string): Indicator {
  return { key, label, weight, value: status === 'needsInput' ? null : value, display: status === 'needsInput' ? 'Needs input' : display, status, points: POINTS[status], explanation };
}
export function scoreHealth(p: FinancialPicture, opts: ScoreOptions): HealthResult {
  const { asOf, changes = [], trigger = 'manual', checkedAt = `${asOf}T00:00:00.000Z`, days = 30 } = opts;
  const missingInputs = financialInputs(p, changes);
  let structuralMissing = missingInputs.length > 0;
  const income = p.paycheck ? Math.round(p.paycheck.avgAmount * PAY_MONTH[p.paycheck.cadenceDays]) : 0;
  if (!p.paycheck) missingInputs.push('Confirm income amount, source account and next payday; no regular paycheck was detected.');
  if (!p.accounts.some((a) => a.type === 'Checking' && a.ownerMemberId === p.memberId)) missingInputs.push('Add a confirmed checking account for the bills forecast.');
  // A future cancellation does not improve today's monthly ratios early.
  const cancelled = new Set(changes.filter((c) => c.kind === 'cancelObligation' && (!c.date || c.date <= asOf)).map((c) => c.obligationKey));
  const active = p.obligations.filter((o) => !cancelled.has(o.key));
  const flags: string[] = [];
  let fromFree = 0, fromGoals = 0;
  let scenario = p;
  for (const c of changes) {
    if (c.kind !== 'oneTime' || c.destinationAccountId || c.amount <= 0 || (c.date && (c.date < asOf || c.date > addDays(asOf, days)))) continue;
    const check = checkSource(scenario, c.amount, c.sourceAccountId ?? '', c.goalId);
    missingInputs.push(...check.missingInputs);
    fromFree += check.fromFree; fromGoals += check.fromGoal;
    if (check.flag) flags.push(check.flag);
    scenario = { ...scenario, goals: scenario.goals.map((g) => g.id === c.goalId ? { ...g, amount: g.amount - check.fromGoal } : g) };
  }
  const forecast = forecastBalance(p, { asOf, changes, days });
  const low = forecast.lowest;
  if (Object.values(forecast.byAccount).some((points) => points.some((point) => !Number.isSafeInteger(point.balance)))) { missingInputs.push('Amounts exceed the supported calculation range.'); structuralMissing = true; }
  const billsStatus: Status = low.balance < 0 ? 'red' : structuralMissing ? 'needsInput' : low.balance >= 20_000 ? 'green' : 'yellow';
  if (billsStatus === 'red') flags.push(`Checking goes negative on ${shortDate(low.date)} after scheduled expenses and commitments.`);
  const bills = indicator('essentialBills', 'Essential bills covered', 40, low.balance, money0(low.balance), billsStatus,
    `Lowest individual checking account: ${money(low.balance)} on ${shortDate(low.date)}. Includes every scheduled expense and reservation. Goal: $200+ buffer.`);
  const essential = active.filter((o) => o.essential).reduce((s, o) => s + monthly(o), 0);
  const free = Math.max(0, freeSavings(p) - fromFree);
  const months = essential > 0 ? free / essential : 0;
  const cushion = indicator('cushion', 'Safety cushion', 20, months, essential ? `${months.toFixed(1)} mo` : 'No essential costs',
    structuralMissing ? 'needsInput' : essential === 0 || months >= 3 ? 'green' : months >= 1 ? 'yellow' : 'red',
    essential ? `${money0(free)} of unallocated savings ÷ ${money0(essential)}/mo essential costs. Goal: 3 months.` : 'Confirmed scheduled essential costs are zero; a coverage ratio is not applicable.');
  const loans = active.filter((o) => o.origin === 'loan').reduce((s, o) => s + monthly(o), 0);
  const cardMinimums = p.accounts.filter((a) => a.type === 'Credit Card' && a.balance > 0).reduce((s, a) => s + (a.minimumPayment ?? 0), 0);
  const debt = loans + cardMinimums;
  const debtRatio = income > 0 ? debt / income : 0;
  const debtStatus: Status = structuralMissing || (income <= 0 && debt > 0) ? 'needsInput' : debtRatio < 0.2 ? 'green' : debtRatio <= 0.36 ? 'yellow' : 'red';
  const debtLoad = indicator('debtLoad', 'Debt load', 15, debtRatio, income > 0 || debt === 0 ? `${(debtRatio * 100).toFixed(1)}%` : 'Confirm income', debtStatus,
    `${money0(loans)} loans + ${money0(cardMinimums)} confirmed card minimums per month.${income > 0 ? ` Income ${money0(income)}/mo.` : ' Income must be confirmed before approval.'}`);
  const since = addDays(asOf, -30);
  const savingIds = new Set(p.accounts.filter((a) => a.type === 'Savings').map((a) => a.id));
  const pulledPast = p.txns.filter((t) => savingIds.has(t.accountId) && (t.kind === 'purchase' || t.kind === 'withdrawal') && t.date >= since && t.date <= asOf).reduce((s, t) => s + t.amount - (t.goalAllocationUsed ?? 0), 0);
  // Fixed pre-scenario baseline: current savings plus lookback withdrawals.
  const baseline = savingsBalance(p) + pulledPast;
  let reservedFromFree = 0;
  const usedGoals = new Map<string, number>();
  for (const r of p.reservations) {
    if (!savingIds.has(r.sourceAccountId)) continue;
    const goal = p.goals.find((g) => g.id === r.goalId && g.accountId === r.sourceAccountId);
    const covered = goal ? Math.min(r.amount, Math.max(0, goal.amount - (usedGoals.get(goal.id) ?? 0))) : 0;
    if (goal) usedGoals.set(goal.id, (usedGoals.get(goal.id) ?? 0) + covered);
    reservedFromFree += r.amount - covered;
  }
  const pulled = pulledPast + fromFree + reservedFromFree;
  // a purchase actually recorded from emergency savings (not just a what-if) gets the same warning
  if (pulledPast > 0 && !flags.includes(EMERGENCY_SAVINGS_FLAG)) flags.push(EMERGENCY_SAVINGS_FLAG);
  const ratio = baseline > 0 ? pulled / baseline : 0;
  const protection = indicator('savingsProtection', 'Savings protection', 15, pulled, money0(pulled), structuralMissing ? 'needsInput' : pulled === 0 ? 'green' : baseline === 0 || ratio >= 0.1 ? 'red' : 'yellow',
    pulled ? `${money0(pulled)} used from unallocated savings; ${(ratio * 100).toFixed(1)}% of the ${money0(baseline)} pre-scenario savings baseline.` : fromGoals ? 'Only the matching goal allocation is consumed; emergency savings are untouched.' : 'No unallocated savings used for spending in the 30-day lookback.');
  const nonessential = active.filter((o) => !o.essential && o.origin === 'detected').reduce((s, o) => s + monthly(o), 0);
  const subRatio = income > 0 ? nonessential / income : 0;
  const subscriptions = indicator('nonEssential', 'Nonessential subscriptions', 10, subRatio, income > 0 ? `${(subRatio * 100).toFixed(1)}%` : 'Confirm income',
    structuralMissing || income <= 0 ? 'needsInput' : subRatio < 0.05 ? 'green' : subRatio <= 0.1 ? 'yellow' : 'red', `${money0(nonessential)}/mo in detected nonessential subscriptions. Goal: under 5% of confirmed income.`);
  const indicators = [bills, cushion, debtLoad, protection, subscriptions];
  const missing = [...new Set(missingInputs)];
  const score = missing.length || indicators.some((i) => i.points === null) ? null : indicators.reduce((s, i) => s + i.points! * i.weight / 100, 0);
  const overall: Status = billsStatus === 'red' ? 'red' : score === null ? 'needsInput' : score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
  return { memberId: p.memberId, score, overall, indicators, forecast: forecast.checking, accountForecasts: forecast.byAccount,
    missingInputs: missing, dataHash: dataHash(p), checkedAt, trigger, flags: [...new Set(flags)] };
}
