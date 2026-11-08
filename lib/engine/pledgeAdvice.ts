// What to do when a huddle pledge fails its private check. Plain math, no AI: the most you can
// safely pledge today, how much to save (per week and per paycheck) to reach the amount you
// wanted by the pay-by date, and which real spending could free that money up.
// Nemotron explains this in words; every number shown comes from here.

import type { FinancialPicture } from '../types';
import { addDays, daysBetween } from './dates';
import { monthlyLeftover } from './fixplan';
import { monthly, scoreHealth } from './health';
import { checkPledge, weeksUntil, type Pledge } from './split';

export interface PledgeCut {
  kind: 'subscription' | 'spending';
  label: string;
  weekly: number; // cents freed per week
}

export interface PledgeAdvice {
  amount: number; // the pledge that failed
  safeToday: number; // the most this account can pledge today and still pass (0 = nothing passes)
  notGreenNow: boolean; // not green before pledging, so no amount can pass yet
  gap: number;
  targetDate: string;
  weeksLeft: number;
  weeklyToSave: number;
  weeklyLeftover: number; // what income minus bills and real spending leaves each week
  nextPayday: string | null;
  paychecksLeft: number; // paydays between now and the pay-by date
  perPaycheck: number | null;
  cuts: PledgeCut[]; // biggest first, only as many as it takes to cover weeklyToSave
  cutsCover: boolean;
}

const DISCRETIONARY = new Set(['Dining', 'Food delivery', 'Entertainment', 'Shopping']);
const WEEKS_PER_MONTH = 52 / 12;
const MAX_CUTS = 4;
const ceilDollar = (cents: number) => Math.ceil(cents / 100) * 100;

function safeAmount(p: FinancialPicture, pledge: Pledge, targetDate: string, asOf: string): number {
  const passes = (amount: number) => checkPledge(p, { ...pledge, amount }, targetDate, asOf).passed;
  let low = 0;
  let high = pledge.amount - 1;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    if (passes(mid)) low = mid; else high = mid - 1;
  }
  const rounded = Math.floor(low / 1000) * 1000; // whole $10 steps are easier to act on
  return rounded > 0 && passes(rounded) ? rounded : 0;
}

function possibleCuts(p: FinancialPicture, asOf: string): PledgeCut[] {
  const subs = p.obligations.filter((o) => !o.essential && o.origin === 'detected');
  const subNames = new Set(subs.map((o) => o.name.toLowerCase()));
  const since = addDays(asOf, -30);
  const byCategory = new Map<string, number>();
  for (const t of p.txns) {
    if (t.kind !== 'purchase' || t.date <= since || t.date > asOf) continue;
    if (!t.category || !DISCRETIONARY.has(t.category)) continue;
    if (t.merchant && subNames.has(t.merchant.toLowerCase())) continue; // already listed as a subscription
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  }
  return [
    ...subs.map((o): PledgeCut => ({ kind: 'subscription', label: `Cancel ${o.name}`, weekly: Math.round(monthly(o) / WEEKS_PER_MONTH) })),
    ...[...byCategory].map(([category, total]): PledgeCut => ({ kind: 'spending', label: `Cut ${category.toLowerCase()} in half`, weekly: Math.round((total / 2) * (7 / 30)) })),
  ].filter((c) => c.weekly >= 100).sort((a, b) => b.weekly - a.weekly || a.label.localeCompare(b.label));
}

/** Null when the check failed for a data problem (bad account, missing input): advice can't help. */
export function pledgeAdvice(p: FinancialPicture, pledge: Pledge, targetDate: string, asOf: string): PledgeAdvice | null {
  const check = checkPledge(p, pledge, targetDate, asOf);
  const before = scoreHealth(p, { asOf });
  const owned = p.accounts.some((a) => a.id === pledge.sourceAccountId && a.ownerMemberId === p.memberId);
  if (check.passed || !owned || before.score === null || check.scoreAfter === null) return null;

  const safeToday = safeAmount(p, pledge, targetDate, asOf);
  const gap = pledge.amount - safeToday;
  const weeksLeft = weeksUntil(asOf, targetDate);
  const weeklyToSave = ceilDollar(gap / weeksLeft);
  const paychecksLeft = p.paycheck && p.paycheck.nextDate <= targetDate
    ? 1 + Math.floor(daysBetween(p.paycheck.nextDate, targetDate) / (p.paycheck.cadenceDays || 30))
    : 0;

  const cuts: PledgeCut[] = [];
  let covered = 0;
  for (const cut of possibleCuts(p, asOf)) {
    if (covered >= weeklyToSave || cuts.length === MAX_CUTS) break;
    cuts.push(cut);
    covered += cut.weekly;
  }

  return {
    amount: pledge.amount, safeToday, notGreenNow: before.overall !== 'green', gap, targetDate, weeksLeft, weeklyToSave,
    weeklyLeftover: Math.max(0, Math.round(monthlyLeftover(p, asOf) / WEEKS_PER_MONTH)),
    nextPayday: p.paycheck?.nextDate ?? null, paychecksLeft,
    perPaycheck: paychecksLeft > 0 ? ceilDollar(gap / paychecksLeft) : null,
    cuts, cutsCover: covered >= weeklyToSave,
  };
}
