// canAfford: "Can I buy ___?" Re-scores your money as if you'd already bought it.
//   yes   : bills stay covered, no emergency savings used, status doesn't drop
//   yesIf : not today, but paying after your next paycheck, or saving up first, works
//   no    : uses emergency savings, or nothing reasonable works right now
// Pure function: same picture + same question + same asOf → same answer.

import type { AffordResult, Change, FinancialPicture, HealthResult, Source, Status } from '../types';
import { money0, shortDate } from '../format';
import { addDays } from './dates';
import { scoreHealth } from './health';
import { EMERGENCY_SAVINGS_FLAG } from './source';

export interface AffordQuestion {
  label: string; // "PS6"
  cost: number;
  date?: string; // when you'd buy it (default today)
  source: Source;
  goalId?: string; // paying from savings set aside for this goal
}

const RANK: Record<Status, number> = { red: 0, yellow: 1, green: 2 };
const SAVE_WEEKS = 20; // "save up first" plan spreads the cost over about 20 weeks

// A purchase is OK if bills stay covered, emergency savings aren't touched, and status doesn't drop.
export function purchaseOk(before: HealthResult, after: HealthResult): boolean {
  return (
    after.indicators[0].status !== 'red' &&
    !after.flags.includes(EMERGENCY_SAVINGS_FLAG) &&
    RANK[after.overall] >= RANK[before.overall]
  );
}

export function canAfford(picture: FinancialPicture, q: AffordQuestion, asOf: string): AffordResult {
  const before = scoreHealth(picture, { asOf });
  const purchase = (over: Partial<Change> = {}): Change => ({
    kind: 'oneTime', amount: q.cost, source: q.source, goalId: q.goalId, date: q.date, label: q.label, ...over,
  });
  const after = scoreHealth(picture, { asOf, changes: [purchase()] });
  const base = { scoreBefore: before.score, scoreAfter: after.score, flags: after.flags };

  if (purchaseOk(before, after)) {
    const scoreText = after.score === before.score ? `stays at ${before.score}` : `goes from ${before.score} to ${after.score}`;
    return { ...base, verdict: 'yes', reason: `You can cover this and every essential bill. Your score ${scoreText}.` };
  }

  const usesEmergency = after.flags.includes(EMERGENCY_SAVINGS_FLAG);
  const billsFlag = after.flags.find((f) => f.startsWith('Checking goes negative'));
  const problem = usesEmergency
    ? 'This uses your emergency savings, not spending money.'
    : billsFlag ?? `Your score would drop from ${before.score} to ${after.score}.`;

  // Option 1: pay from checking after the next paycheck lands
  const payday = picture.paycheck?.nextDate;
  if (payday && (!q.date || q.date < payday)) {
    const later = scoreHealth(picture, { asOf, changes: [purchase({ source: 'checking', goalId: undefined, date: payday })] });
    if (purchaseOk(before, later)) {
      return {
        ...base,
        verdict: usesEmergency ? 'no' : 'yesIf',
        reason: `${problem} Paying from checking after your ${shortDate(payday)} paycheck works instead.`,
        readyDate: payday,
      };
    }
  }

  // Option 2: set money aside each week, then buy it
  const weekly = Math.ceil(q.cost / SAVE_WEEKS / 5) * 5;
  const saving = scoreHealth(picture, {
    asOf, changes: [{ kind: 'weekly', amount: weekly, goalId: 'afford', label: `Save for ${q.label}` }],
  });
  if (purchaseOk(before, saving)) {
    const readyDate = addDays(asOf, Math.ceil(q.cost / weekly) * 7);
    return {
      ...base,
      verdict: usesEmergency ? 'no' : 'yesIf',
      reason: `${problem} Set aside ${money0(weekly)}/week and it’s yours by ${shortDate(readyDate)}.`,
      weeklySavingsNeeded: weekly,
      readyDate,
    };
  }

  return { ...base, verdict: 'no', reason: `${problem} Even saving up first would strain your bills right now.` };
}
