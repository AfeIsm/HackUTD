// Huddle math: how much each person can safely commit, the private pledge check,
// fair splits and shortfalls. Pure functions, no AI.

import type { FinancialPicture, Source } from '../types';
import { money0, shortDate } from '../format';
import { purchaseOk } from './afford';
import { daysBetween } from './dates';
import { scoreHealth } from './health';
import { EMERGENCY_SAVINGS_FLAG } from './source';

// Saving for a group purchase shouldn't take more than 10% of each paycheck.
export const WEEKLY_SAVINGS_CAP = 0.1;
const PAYCHECKS_PER_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };

export function weeksUntil(asOf: string, date: string): number {
  return Math.max(1, Math.floor(daysBetween(asOf, date) / 7));
}

function weeklyIncome(picture: FinancialPicture): number {
  const p = picture.paycheck;
  if (!p) return 0;
  const monthly = p.avgAmount * (PAYCHECKS_PER_MONTH[p.cadenceDays] ?? 30 / p.cadenceDays);
  return (monthly * 12) / 52;
}

/** The most someone can commit from checking by `targetDate` (rounded down to $50). */
export function capacity(picture: FinancialPicture, targetDate: string, asOf: string): number {
  const perWeek = weeklyIncome(picture) * WEEKLY_SAVINGS_CAP;
  return Math.floor((perWeek * weeksUntil(asOf, targetDate)) / 50) * 50;
}

export interface Pledge {
  amount: number;
  source: Source;
  goalId?: string; // savings set aside for this trip
}

export interface PledgeCheck {
  passed: boolean;
  scoreBefore: number;
  scoreAfter: number;
  reason: string;
  weekly?: number; // for checking pledges: how much to set aside each week
  suggestion?: { amount: number; source: 'checking'; weekly: number; text: string };
}

/**
 * The private check when someone confirms a pledge. Only they ever see the result.
 * From checking: they set aside amount ÷ weeks each week until the trip (max 10% of pay).
 * From savings: paid now; fine if it's the trip's own goal money, flagged if it's emergency savings.
 */
export function checkPledge(picture: FinancialPicture, pledge: Pledge, targetDate: string, asOf: string): PledgeCheck {
  const before = scoreHealth(picture, { asOf });
  const weeks = weeksUntil(asOf, targetDate);
  const cap = capacity(picture, targetDate, asOf);
  const suggest = (amount: number) => {
    const weekly = Math.ceil(amount / weeks);
    return { amount, source: 'checking' as const, weekly, text: `Commit ${money0(amount)} from checking: set aside ${money0(weekly)}/week until ${shortDate(targetDate)}.` };
  };

  if (pledge.source === 'checking') {
    const weekly = Math.ceil(pledge.amount / weeks);
    const after = scoreHealth(picture, {
      asOf, changes: [{ kind: 'weekly', amount: weekly, goalId: 'huddle', label: 'Huddle savings' }],
    });
    if (pledge.amount <= cap && purchaseOk(before, after)) {
      return { passed: true, scoreBefore: before.score, scoreAfter: after.score, weekly,
        reason: `Set aside ${money0(weekly)}/week until ${shortDate(targetDate)}. Your score stays at ${after.score}.` };
    }
    return {
      passed: false, scoreBefore: before.score, scoreAfter: after.score, weekly,
      reason: `That’s ${money0(weekly)}/week from checking, more than 10% of your paycheck.`,
      suggestion: cap > 0 ? suggest(cap) : undefined,
    };
  }

  const after = scoreHealth(picture, {
    asOf, changes: [{ kind: 'oneTime', amount: pledge.amount, source: 'savings', goalId: pledge.goalId, label: 'Huddle pledge' }],
  });
  if (purchaseOk(before, after)) {
    return { passed: true, scoreBefore: before.score, scoreAfter: after.score,
      reason: `Paid from savings set aside for this trip. Your score stays at ${after.score}.` };
  }
  const emergency = after.flags.includes(EMERGENCY_SAVINGS_FLAG);
  return {
    passed: false, scoreBefore: before.score, scoreAfter: after.score,
    reason: emergency
      ? `This uses your emergency savings, not spending money. Your score would drop from ${before.score} to ${after.score}.`
      : `Your score would drop from ${before.score} to ${after.score}.`,
    suggestion: cap > 0 ? suggest(Math.min(pledge.amount, cap)) : undefined,
  };
}

/** Split `total` in proportion to each person's capacity. Returns amounts only (never finances). */
export function fairSplit(total: number, capacities: Record<string, number>): Record<string, number> {
  const ids = Object.keys(capacities).sort();
  const sum = ids.reduce((s, id) => s + capacities[id], 0);
  if (sum <= 0) return Object.fromEntries(ids.map((id) => [id, Math.round(total / Math.max(ids.length, 1))]));
  const split: Record<string, number> = {};
  let assigned = 0;
  for (const id of ids) {
    split[id] = Math.floor(((total * capacities[id]) / sum) / 10) * 10;
    assigned += split[id];
  }
  const biggest = ids.reduce((a, b) => (capacities[b] > capacities[a] ? b : a), ids[0]);
  split[biggest] += total - assigned; // rounding leftover goes to whoever has the most room
  return split;
}

export function shortfall(total: number, pledges: number[]): number {
  return Math.max(0, total - pledges.reduce((s, p) => s + p, 0));
}
