// checkSource: is this money coming from the right place?
// Checking = spending money. Savings set aside for THIS goal = fine.
// Savings NOT set aside for anything = emergency money → flag it.

import type { FinancialPicture, Source } from '../types';

export const EMERGENCY_SAVINGS_FLAG = 'This uses your emergency savings, not spending money.';

export interface SourceCheck {
  fromGoal: number; // paid from savings set aside for this goal
  fromFree: number; // paid from emergency (unallocated) savings
  usesEmergencySavings: boolean;
  flag: string | null;
}

export function savingsBalance(picture: FinancialPicture): number {
  return picture.accounts.filter((a) => a.type === 'Savings').reduce((s, a) => s + a.balance, 0);
}

// Savings not set aside for any goal (never below zero)
export function freeSavings(picture: FinancialPicture): number {
  const setAside = picture.goals.reduce((s, g) => s + g.amount, 0);
  return Math.max(0, savingsBalance(picture) - setAside);
}

export function checkSource(
  picture: FinancialPicture,
  amount: number,
  source: Source,
  goalId?: string,
): SourceCheck {
  if (source === 'checking' || amount <= 0) {
    return { fromGoal: 0, fromFree: 0, usesEmergencySavings: false, flag: null };
  }
  const goal = goalId ? picture.goals.find((g) => g.id === goalId) : undefined;
  const fromGoal = goal ? Math.min(amount, goal.amount) : 0;
  const fromFree = Math.round((amount - fromGoal) * 100) / 100;
  const usesEmergencySavings = fromFree > 0;
  return { fromGoal, fromFree, usesEmergencySavings, flag: usesEmergencySavings ? EMERGENCY_SAVINGS_FLAG : null };
}
