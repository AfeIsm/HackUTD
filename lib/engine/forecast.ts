// forecastBalance: project checking and savings day by day.
// + paychecks, − bills/loans/subscriptions, ± hypothetical changes (what-ifs).
// Pure function: `asOf` (today) is passed in, so the same inputs always give the same forecast.

import type { Change, FinancialPicture, ForecastPoint, Obligation, Source } from '../types';
import { addDays, addMonths } from './dates';

export interface ForecastOptions {
  asOf: string; // YYYY-MM-DD, "today"
  days?: number; // default 30
  changes?: Change[];
  essentialOnly?: boolean; // only essential obligations (for the "Essential bills covered" indicator)
}

export interface Forecast {
  checking: ForecastPoint[]; // one point per day, asOf … asOf+days
  savings: ForecastPoint[];
  lowest: ForecastPoint; // lowest checking balance (earliest date on a tie)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stepFor(cadence: Obligation['cadence']): (d: string) => string {
  if (cadence === 'weekly') return (d) => addDays(d, 7);
  if (cadence === 'biweekly') return (d) => addDays(d, 14);
  return (d) => addMonths(d, 1);
}

export function forecastBalance(picture: FinancialPicture, opts: ForecastOptions): Forecast {
  const { asOf, days = 30, changes = [], essentialOnly = false } = opts;
  const end = addDays(asOf, days);

  // Money moving on each date, per account
  const flows = new Map<string, Record<Source, number>>();
  const add = (date: string, account: Source, amount: number) => {
    if (date < asOf || date > end) return;
    const day = flows.get(date) ?? { checking: 0, savings: 0 };
    day[account] += amount;
    flows.set(date, day);
  };

  // Every occurrence from `start` (rolled forward past stale dates) up to the end of the window
  const each = (start: string, step: (d: string) => string, fn: (d: string) => void) => {
    let d = start;
    while (d < asOf) d = step(d);
    while (d <= end) {
      fn(d);
      d = step(d);
    }
  };

  // Paychecks → checking
  const pay = picture.paycheck;
  if (pay) {
    const step = pay.cadenceDays === 30 ? (d: string) => addMonths(d, 1) : (d: string) => addDays(d, pay.cadenceDays);
    each(pay.nextDate, step, (d) => add(d, 'checking', pay.avgAmount));
  }

  // Obligations → out of checking (unless cancelled by a what-if)
  const cancelledFrom = new Map<string, string>();
  for (const c of changes) {
    if (c.kind === 'cancelObligation' && c.obligationKey) cancelledFrom.set(c.obligationKey, c.date ?? asOf);
  }
  for (const o of picture.obligations) {
    if (essentialOnly && !o.essential) continue;
    const stopAt = cancelledFrom.get(o.key);
    each(o.nextDate, stepFor(o.cadence), (d) => {
      if (stopAt === undefined || d < stopAt) add(d, 'checking', -o.amount);
    });
  }

  // What-if changes: money leaves `source`; with a goal it lands in savings instead of being spent
  const move = (c: Change, date: string) => {
    add(date, c.source ?? 'checking', -c.amount);
    if (c.goalId) add(date, 'savings', c.amount);
  };
  for (const c of changes) {
    if (c.kind === 'oneTime') move(c, c.date ?? asOf);
    if (c.kind === 'weekly') each(c.date ?? addDays(asOf, 7), (d) => addDays(d, 7), (d) => move(c, d));
    if (c.kind === 'monthly') each(c.date ?? addMonths(asOf, 1), (d) => addMonths(d, 1), (d) => move(c, d));
  }

  // Walk day by day
  let checking = picture.accounts.filter((a) => a.type === 'Checking').reduce((s, a) => s + a.balance, 0);
  let savings = picture.accounts.filter((a) => a.type === 'Savings').reduce((s, a) => s + a.balance, 0);
  const checkingPts: ForecastPoint[] = [];
  const savingsPts: ForecastPoint[] = [];
  let lowest: ForecastPoint | null = null;

  for (let i = 0; i <= days; i++) {
    const date = addDays(asOf, i);
    const f = flows.get(date);
    if (f) {
      checking += f.checking;
      savings += f.savings;
    }
    const point = { date, balance: round2(checking) };
    checkingPts.push(point);
    savingsPts.push({ date, balance: round2(savings) });
    if (!lowest || point.balance < lowest.balance) lowest = point;
  }

  return { checking: checkingPts, savings: savingsPts, lowest: lowest as ForecastPoint };
}
