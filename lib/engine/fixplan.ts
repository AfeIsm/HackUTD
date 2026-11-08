// Fix plan: the smallest set of concrete changes that gets someone to green (or as close as
// possible). Plain math, no AI: every candidate is re-scored with scoreHealth, so the numbers
// in the plan are exactly what the score would be. Same picture → same plan.
//
// Levers, smallest disruption first:
//   1. Cancel non-essential subscriptions (each cut is a scored cancelObligation change).
//   2. Move free savings (never goal money) into the checking account that dips lowest, just
//      enough to stop it going negative or to keep the $200 buffer. Applied to the balances
//      themselves, so the safety cushion honestly shrinks by the same amount.
//   3. A weekly savings target toward a 3-month cushion, sized so bills stay covered.

import type { Change, FinancialPicture, FixPlan, FixStep, HealthResult } from '../types';
import { money0, shortDate } from '../format';
import { forecastBalance } from './forecast';
import { monthly, scoreHealth } from './health';
import { freeSavings } from './source';
import { addDays } from './dates';

const BUFFER = 20_000; // the essential-bills indicator's green buffer ($200)
const MAX_SUBS = 6; // 2^6 = 64 combinations, each scored a few times: cheap and exhaustive
const CUSHION_MONTHS = 3;
const SAVE_WEEKS = 26;

const PAY_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };

/**
 * What's really left each month: income − bills/loans − everything actually spent in the last
 * 30 days (purchases + withdrawals on every account, which already includes subscriptions,
 * groceries, gas, dining). The forecast doesn't model day-to-day spending, so a savings target
 * must never exceed this.
 */
export function monthlyLeftover(p: FinancialPicture, asOf: string): number {
  if (!p.paycheck) return 0;
  const income = Math.round(p.paycheck.avgAmount * (PAY_MONTH[p.paycheck.cadenceDays] ?? 1));
  const billsAndLoans = p.obligations.filter((o) => o.origin === 'bill' || o.origin === 'loan').reduce((s, o) => s + monthly(o), 0);
  const since = addDays(asOf, -30);
  const savingIds = new Set(p.accounts.filter((a) => a.type === 'Savings').map((a) => a.id));
  const spent = p.txns
    .filter((t) => (t.kind === 'purchase' || t.kind === 'withdrawal') && !savingIds.has(t.accountId) && t.date > since && t.date <= asOf)
    .reduce((s, t) => s + t.amount, 0);
  return income - billsAndLoans - spent;
}

const roundDown10 = (cents: number) => Math.floor(cents / 1000) * 1000;
const roundUp10 = (cents: number) => Math.ceil(cents / 1000) * 1000; // whole $10 steps

const moveMoney = (p: FinancialPicture, from: string, to: string, amount: number): FinancialPicture => ({
  ...p,
  accounts: p.accounts.map((a) =>
    a.id === from ? { ...a, balance: a.balance - amount } : a.id === to ? { ...a, balance: a.balance + amount } : a),
});

interface Candidate { cuts: string[]; cutMonthly: number; move: number; result: HealthResult; picture: FinancialPicture; changes: Change[] }

// Moving savings is a LAST resort (it shuffles your own money and shrinks your cushion): any plan
// that works without it wins. Then fewest cancellations, smallest monthly cut, smallest transfer.
const lessDisruptive = (a: Candidate, b: Candidate) =>
  Number(a.move > 0) - Number(b.move > 0) || a.cuts.length - b.cuts.length || a.cutMonthly - b.cutMonthly || a.move - b.move;

function lowestChecking(p: FinancialPicture, checkingIds: string[], changes: Change[], asOf: string) {
  const f = forecastBalance(p, { asOf, changes });
  return checkingIds
    .map((id) => ({ id, balance: f.lowestByAccount[id]?.balance ?? 0, date: f.lowestByAccount[id]?.date ?? asOf }))
    .sort((x, y) => x.balance - y.balance)[0];
}

export function buildFixPlan(p: FinancialPicture, asOf: string): FixPlan | null {
  const before = scoreHealth(p, { asOf });
  if (before.score === null) return null; // needs input first; the dashboard already asks for it

  const owned = p.accounts.filter((a) => a.ownerMemberId === p.memberId);
  const checkingIds = owned.filter((a) => a.type === 'Checking').map((a) => a.id);
  const savings = owned.filter((a) => a.type === 'Savings')
    .map((a) => ({ id: a.id, name: a.nickname, free: freeSavings(p, a.id) }))
    .sort((x, y) => y.free - x.free)[0];
  const subs = p.obligations
    .filter((o) => !o.essential && o.origin === 'detected')
    .sort((x, y) => monthly(y) - monthly(x) || x.key.localeCompare(y.key))
    .slice(0, MAX_SUBS);

  const candidates: Candidate[] = [];
  for (let mask = 0; mask < 1 << subs.length; mask++) {
    const cut = subs.filter((_, i) => mask & (1 << i));
    const changes: Change[] = cut.map((o) => ({ kind: 'cancelObligation', amount: 0, obligationKey: o.key, date: asOf, label: `Cancel ${o.name}` }));
    const cutMonthly = cut.reduce((s, o) => s + monthly(o), 0);
    const low = checkingIds.length ? lowestChecking(p, checkingIds, changes, asOf) : undefined;
    const moves = new Set([0]);
    if (savings && low && savings.free > 0) {
      for (const need of [-low.balance, BUFFER - low.balance]) {
        const amount = roundUp10(need);
        if (need > 0 && amount <= savings.free) moves.add(amount);
      }
    }
    for (const move of moves) {
      const picture = move && savings && low ? moveMoney(p, savings.id, low.id, move) : p;
      const result = scoreHealth(picture, { asOf, changes });
      if (result.score !== null) candidates.push({ cuts: cut.map((o) => o.key), cutMonthly, move, result, picture, changes });
    }
  }

  // Not green: the least disruptive plan that reaches green (lowest green score is enough).
  // No green possible, or already green: the least disruptive plan with the best score.
  const green = candidates.filter((c) => c.result.overall === 'green');
  const aimForGreen = before.overall !== 'green' && green.length > 0;
  const pool = aimForGreen ? green : candidates;
  const target = aimForGreen ? Math.min(...green.map((c) => c.result.score ?? 0)) : Math.max(...pool.map((c) => c.result.score ?? 0));
  const chosen = pool
    .filter((c) => (c.result.score ?? 0) >= target && (c.result.score ?? 0) > (before.score ?? 0))
    .sort(lessDisruptive)[0];

  const steps: FixStep[] = [];
  const after = chosen?.result ?? before;
  const picture = chosen?.picture ?? p;
  if (chosen) {
    for (const key of chosen.cuts) {
      const o = subs.find((s) => s.key === key)!;
      steps.push({ kind: 'cancel', label: `Cancel ${o.name}`, detail: `Saves ${money0(monthly(o))} a month.`, amount: monthly(o), obligationKey: o.key });
    }
    if (chosen.move && savings) {
      const low = lowestChecking(p, checkingIds, chosen.changes, asOf);
      const to = owned.find((a) => a.id === low.id);
      steps.push({
        kind: 'move',
        label: `Short-term: move ${money0(chosen.move)} from ${savings.name} to ${to?.nickname ?? 'checking'}`,
        detail: `Your checking would dip to ${money0(low.balance)} on ${shortDate(low.date)}, too close to your bills. This covers the dip, but it uses emergency savings, so it's a stopgap: nothing else we tested gets you there. Never touches money set aside for a goal.`,
        amount: chosen.move, fromAccountId: savings.id, toAccountId: low.id,
      });
    }
  }

  // Cushion still short? Find the largest weekly transfer that keeps the bills indicator green.
  const cushion = after.indicators.find((i) => i.key === 'cushion');
  const cancelled = new Set(chosen?.cuts ?? []);
  const essentialMonthly = picture.obligations.filter((o) => o.essential && !cancelled.has(o.key)).reduce((s, o) => s + monthly(o), 0);
  const gap = CUSHION_MONTHS * essentialMonthly - freeSavings(picture);
  const fromId = checkingIds[0];
  const toId = savings?.id;
  if (cushion && cushion.status !== 'green' && gap > 0 && fromId && toId) {
    const billsOk = (weekly: number) => scoreHealth(picture, {
      asOf,
      changes: [...(chosen?.changes ?? []), { kind: 'weekly', amount: weekly, sourceAccountId: fromId, destinationAccountId: toId, label: 'Weekly savings' }],
    }).indicators.find((i) => i.key === 'essentialBills')?.status === 'green';
    // Half of the real monthly leftover, as a weekly amount: leaves room for surprises.
    const affordable = roundDown10(Math.max(0, monthlyLeftover(picture, asOf)) * 0.5 * 12 / 52);
    const ideal = Math.min(roundUp10(gap / SAVE_WEEKS), affordable);
    let weekly = 0;
    if (ideal <= 0) weekly = 0;
    else if (billsOk(ideal)) weekly = ideal;
    else {
      let lo = 0, hi = ideal / 1000; // search in $10 steps
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (billsOk(mid * 1000)) lo = mid; else hi = mid - 1;
      }
      weekly = lo * 1000;
    }
    if (weekly > 0) {
      const weeks = Math.ceil(gap / weekly);
      steps.push({
        kind: 'save', label: `Save ${money0(weekly)} a week`,
        detail: `Builds a ${CUSHION_MONTHS}-month safety cushion (${money0(CUSHION_MONTHS * essentialMonthly)} of essential costs) in about ${weeks} weeks, while your bills stay covered.`,
        amount: weekly, fromAccountId: fromId, toAccountId: toId, weeks,
      });
    }
  }

  const stillNotGreen = after.indicators.filter((i) => i.status !== 'green').map((i) => i.label);
  const scored = steps.filter((s) => s.kind !== 'save');
  const summary = scored.length
    ? `${scored.map((s) => s.label).join(' and ')}: score ${before.score} → ${after.score} (${after.overall}).`
    : steps.length
      ? `Your score is ${before.score}. ${steps[0].label} to build your safety cushion.`
      : before.overall === 'green'
        ? 'You’re green. Nothing needs fixing right now.'
        : `No change we can simulate raises your score above ${before.score}. Focus on: ${stillNotGreen.join(', ')}.`;

  return {
    summary, steps, changes: chosen?.changes ?? [],
    scoreBefore: before.score, scoreAfter: after.score, statusBefore: before.overall, statusAfter: after.overall,
    stillNotGreen, dataHash: before.dataHash,
  };
}
