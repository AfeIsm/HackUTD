import type { Change, FinancialPicture, ForecastPoint } from '../types';
import { addDays, addMonths, nextSemiMonthly } from './dates';
import { validDate } from './validation';

export interface ForecastOptions {
  asOf: string; days?: number; changes?: Change[];
  essentialOnly?: boolean; // analysis only; health and approval always include ALL scheduled outflows
}
export interface Forecast {
  checking: ForecastPoint[]; savings: ForecastPoint[];
  byAccount: Record<string, ForecastPoint[]>;
  lowest: ForecastPoint;
  lowestByAccount: Record<string, ForecastPoint>;
}
export function forecastBalance(p: FinancialPicture, opts: ForecastOptions): Forecast {
  const { asOf, days = 30, changes = [], essentialOnly = false } = opts;
  if (!validDate(asOf) || !Number.isInteger(days) || days < 0 || days > 365) throw new Error('Invalid forecast interval');
  const end = addDays(asOf, days);
  const accounts = p.accounts.filter((a) => a.ownerMemberId === p.memberId && a.type !== 'Credit Card');
  const flows = new Map<string, Map<string, number>>();
  const add = (date: string, id: string, amount: number) => {
    if (date < asOf || date > end || !accounts.some((a) => a.id === id) || !Number.isSafeInteger(amount)) return;
    const day = flows.get(date) ?? new Map<string, number>();
    day.set(id, (day.get(id) ?? 0) + amount); flows.set(date, day);
  };
  const each = (start: string, cadence: number, fn: (d: string) => void, semi?: [number, number]) => {
    if (!validDate(start) || ![7, 14, 15, 30].includes(cadence)) return;
    let d = start;
    for (let n = 0; d <= end && n < 2000; n++) {
      if (d >= asOf) fn(d);
      d = cadence === 30 ? addMonths(start, n + 1) : cadence === 15 && semi ? nextSemiMonthly(d, semi) : addDays(d, cadence);
    }
  };
  if (p.paycheck) each(p.paycheck.nextDate, p.paycheck.cadenceDays, (d) => add(d, p.paycheck!.accountId, p.paycheck!.avgAmount), p.paycheck.semiMonthlyDays);
  for (const o of p.obligations) {
    if (essentialOnly && !o.essential) continue;
    const stops = changes.filter((c) => c.kind === 'cancelObligation' && c.obligationKey === o.key).map((c) => c.date ?? asOf).sort();
    each(o.nextDate, o.cadence === 'weekly' ? 7 : o.cadence === 'biweekly' ? 14 : 30, (d) => {
      if (!stops.length || d < stops[0]) add(d, o.accountId, -o.amount);
    });
  }
  // A reservation is an outflow exactly once, not an additional savings allocation.
  for (const r of p.reservations) add(r.date < asOf ? asOf : r.date, r.sourceAccountId, -r.amount);
  for (const c of changes) {
    if (c.kind === 'cancelObligation' || !c.sourceAccountId) continue;
    const move = (d: string) => {
      add(d, c.sourceAccountId!, -c.amount);
      if (c.destinationAccountId) add(d, c.destinationAccountId, c.amount);
    };
    if (c.kind === 'oneTime') move(c.date ?? asOf);
    else each(c.date ?? (c.kind === 'weekly' ? addDays(asOf, 7) : addMonths(asOf, 1)), c.kind === 'weekly' ? 7 : 30, move);
  }
  const byAccount: Record<string, ForecastPoint[]> = Object.fromEntries(accounts.map((a) => [a.id, []]));
  const balances = new Map(accounts.map((a) => [a.id, a.balance]));
  const checking: ForecastPoint[] = [], savings: ForecastPoint[] = [];
  const lowestByAccount: Record<string, ForecastPoint> = {};
  for (let i = 0; i <= days; i++) {
    const date = addDays(asOf, i);
    let checkingTotal = 0, savingsTotal = 0;
    for (const a of accounts) {
      const balance = balances.get(a.id)! + (flows.get(date)?.get(a.id) ?? 0);
      balances.set(a.id, balance);
      const point = { date, balance };
      byAccount[a.id].push(point);
      if (!lowestByAccount[a.id] || balance < lowestByAccount[a.id].balance) lowestByAccount[a.id] = point;
      if (a.type === 'Checking') checkingTotal += balance; else savingsTotal += balance;
    }
    checking.push({ date, balance: checkingTotal }); savings.push({ date, balance: savingsTotal });
  }
  // A rich second account must never conceal a shortfall in the account paying a bill.
  const lows = accounts.filter((a) => a.type === 'Checking').map((a) => lowestByAccount[a.id]);
  const lowest = lows.reduce((a, b) => b.balance < a.balance || (b.balance === a.balance && b.date < a.date) ? b : a, lows[0] ?? { date: asOf, balance: 0 });
  return { checking, savings, byAccount, lowest, lowestByAccount };
}
