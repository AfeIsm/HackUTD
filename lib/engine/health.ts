// scoreHealth: 5 weighted indicators → one score out of 100.
//   Essential bills covered 40% · Safety cushion 20% · Debt load 15%
//   Savings protection 15% · Non-essential spending 10%
// Each indicator: green = 100 pts, yellow = 50, red = 0. Score = Σ points × weight.
// Hard rule: if essential bills aren't covered, the overall status is red no matter what.
// Pure function: same picture + same changes + same asOf → same result.

import type { Change, FinancialPicture, HealthResult, Indicator, IndicatorKey, Obligation, Status } from '../types';
import { addDays } from './dates';
import { forecastBalance } from './forecast';
import { dataHash } from './hash';
import { EMERGENCY_SAVINGS_FLAG, checkSource, freeSavings, savingsBalance } from './source';

export interface ScoreOptions {
  asOf: string; // YYYY-MM-DD, "today"
  changes?: Change[]; // what-ifs: "as if I bought this"
  trigger?: string; // what caused this check, shown in the UI
  checkedAt?: string; // ISO timestamp; defaults to asOf
}

const POINTS: Record<Status, 0 | 50 | 100> = { green: 100, yellow: 50, red: 0 };
const PAYCHECKS_PER_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };
const CARD_MIN_RATE = 0.03; // card minimum payment ≈ 3% of balance, at least $25
const CARD_MIN_FLOOR = 25;

// ---------- formatting ----------
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ---------- monthly amounts ----------
function monthly(o: Obligation): number {
  if (o.cadence === 'weekly') return (o.amount * 52) / 12;
  if (o.cadence === 'biweekly') return (o.amount * 26) / 12;
  return o.amount;
}

function monthlyIncome(picture: FinancialPicture): number {
  const p = picture.paycheck;
  if (!p) return 0;
  return p.avgAmount * (PAYCHECKS_PER_MONTH[p.cadenceDays] ?? 30 / p.cadenceDays);
}

function indicator(
  key: IndicatorKey, label: string, weight: number, value: number, display: string, status: Status, explanation: string,
): Indicator {
  return { key, label, weight, value, display, status, points: POINTS[status], explanation };
}

export function scoreHealth(picture: FinancialPicture, opts: ScoreOptions): HealthResult {
  const { asOf, changes = [], trigger = 'manual', checkedAt = `${asOf}T00:00:00.000Z` } = opts;
  const flags: string[] = [];

  // Obligations still being paid after "cancel" what-ifs
  const cancelled = new Set(changes.filter((c) => c.kind === 'cancelObligation').map((c) => c.obligationKey));
  const active = picture.obligations.filter((o) => !cancelled.has(o.key));
  const income = monthlyIncome(picture);

  // Where planned one-time spending comes from (checkSource)
  let plannedFromFree = 0;
  let plannedFromGoals = 0;
  for (const c of changes) {
    // only one-time spending counts here; moving checking → a goal is saving, not spending
    if (c.kind !== 'oneTime' || (c.goalId && c.source !== 'savings')) continue;
    const check = checkSource(picture, c.amount, c.source ?? 'checking', c.goalId);
    plannedFromFree += check.fromFree;
    plannedFromGoals += check.fromGoal;
    if (check.flag && !flags.includes(check.flag)) flags.push(check.flag);
  }

  // 1. Essential bills covered (40%): lowest checking over 30 days, essential bills only
  const essentialForecast = forecastBalance(picture, { asOf, changes, essentialOnly: true });
  const low = essentialForecast.lowest;
  const billsStatus: Status = low.balance >= 200 ? 'green' : low.balance >= 0 ? 'yellow' : 'red';
  if (billsStatus === 'red') flags.push(`Checking goes negative on ${shortDate(low.date)}, before an essential bill is paid.`);
  const essentialBills = indicator(
    'essentialBills', 'Essential bills covered', 40, low.balance, money0(low.balance), billsStatus,
    `Lowest projected checking balance is ${money(low.balance)} on ${shortDate(low.date)}. Goal: $200+ buffer.`,
  );

  // 2. Safety cushion (20%): savings not set aside ÷ monthly essential costs
  const monthlyEssential = active.filter((o) => o.essential).reduce((s, o) => s + monthly(o), 0);
  const free = Math.max(0, freeSavings(picture) - plannedFromFree);
  const months = monthlyEssential > 0 ? free / monthlyEssential : free > 0 ? Infinity : 0;
  const cushionStatus: Status = monthlyEssential === 0 || months >= 3 ? 'green' : months >= 1 ? 'yellow' : 'red';
  const cushion = indicator(
    'cushion', 'Safety cushion', 20, Number.isFinite(months) ? Math.round(months * 100) / 100 : 99,
    Number.isFinite(months) ? `${months.toFixed(1)} mo` : 'No bills', cushionStatus,
    `${money0(free)} of savings not set aside ÷ ${money0(monthlyEssential)}/mo essential costs. Goal: 3 months.`,
  );

  // 3. Debt load (15%): (loan payments + card minimums) ÷ monthly income
  const loanPayments = active.filter((o) => o.origin === 'loan').reduce((s, o) => s + monthly(o), 0);
  const cardMinimums = picture.accounts
    .filter((a) => a.type === 'Credit Card' && a.balance > 0)
    .reduce((s, a) => s + Math.max(CARD_MIN_FLOOR, a.balance * CARD_MIN_RATE), 0);
  const debt = loanPayments + cardMinimums;
  const debtRatio = income > 0 ? debt / income : debt > 0 ? Infinity : 0;
  const debtStatus: Status = debtRatio < 0.2 ? 'green' : debtRatio <= 0.36 ? 'yellow' : 'red';
  const debtLoad = indicator(
    'debtLoad', 'Debt load', 15, Number.isFinite(debtRatio) ? Math.round(debtRatio * 1000) / 1000 : 99,
    Number.isFinite(debtRatio) ? pct(debtRatio) : 'No income', debtStatus,
    income > 0
      ? `${money0(loanPayments)} loans + ${money0(cardMinimums)} card minimum ÷ ${money0(income)}/mo income. Goal: under 20%.`
      : `${money0(debt)}/mo in debt payments and no detected income.`,
  );

  // 4. Savings protection (15%): savings pulled for spending in the last 30 days or planned,
  //    not counting savings set aside for that purchase
  const since = addDays(asOf, -30);
  const pulledPast = picture.txns
    .filter((t) => t.source === 'savings' && (t.kind === 'purchase' || t.kind === 'withdrawal'))
    .filter((t) => !t.category?.startsWith('goal:')) // spending a goal's own money is fine
    .filter((t) => t.date >= since && t.date <= asOf)
    .reduce((s, t) => s + t.amount, 0);
  const pulled = pulledPast + plannedFromFree;
  // a real purchase from emergency savings (not just a what-if) gets the same warning
  if (pulledPast > 0 && !flags.includes(EMERGENCY_SAVINGS_FLAG)) flags.push(EMERGENCY_SAVINGS_FLAG);
  const savings = savingsBalance(picture);
  const pulledRatio = savings > 0 ? pulled / savings : pulled > 0 ? 1 : 0;
  const protectStatus: Status = pulled === 0 ? 'green' : pulledRatio < 0.1 ? 'yellow' : 'red';
  const savingsProtection = indicator(
    'savingsProtection', 'Savings protection', 15, Math.round(pulled * 100) / 100, money0(pulled), protectStatus,
    pulled === 0
      ? plannedFromGoals > 0
        ? 'Only savings set aside for this goal is used. Your emergency savings are untouched.'
        : 'Nothing pulled from savings for spending in the last 30 days.'
      : `${money0(pulled)} pulled from savings not set aside for a goal: ${pct(pulledRatio)} of savings. Goal: none.`,
  );

  // 5. Non-essential spending (10%): non-essential subscriptions ÷ monthly income
  const nonEssentialMonthly = active.filter((o) => !o.essential).reduce((s, o) => s + monthly(o), 0);
  const neRatio = income > 0 ? nonEssentialMonthly / income : nonEssentialMonthly > 0 ? Infinity : 0;
  const neStatus: Status = neRatio < 0.05 ? 'green' : neRatio <= 0.1 ? 'yellow' : 'red';
  const nonEssential = indicator(
    'nonEssential', 'Non-essential spending', 10, Number.isFinite(neRatio) ? Math.round(neRatio * 1000) / 1000 : 99,
    Number.isFinite(neRatio) ? pct(neRatio) : 'No income', neStatus,
    income > 0
      ? `${money0(nonEssentialMonthly)}/mo in non-essential subscriptions ÷ ${money0(income)}/mo income. Goal: under 5%.`
      : `${money0(nonEssentialMonthly)}/mo in non-essential subscriptions and no detected income.`,
  );

  const indicators = [essentialBills, cushion, debtLoad, savingsProtection, nonEssential];
  const score = Math.round(indicators.reduce((s, i) => s + (i.points * i.weight) / 100, 0));
  let overall: Status = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
  if (billsStatus === 'red') overall = 'red'; // nothing makes up for missing rent

  return {
    memberId: picture.memberId,
    score,
    overall,
    indicators,
    forecast: forecastBalance(picture, { asOf, changes }).checking,
    dataHash: dataHash(picture),
    checkedAt,
    trigger,
    flags,
  };
}
