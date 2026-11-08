import type { FinancialPicture } from '../types';
import { validCents } from './money';

export const EMERGENCY_SAVINGS_FLAG = 'This uses your emergency savings, not spending money.';
export const savingsBalance = (p: FinancialPicture): number => p.accounts
  .filter((a) => a.type === 'Savings' && a.ownerMemberId === p.memberId).reduce((s, a) => s + a.balance, 0);

export function freeSavings(p: FinancialPicture, accountId?: string): number {
  const ids = new Set(p.accounts.filter((a) => a.type === 'Savings' && a.ownerMemberId === p.memberId && (!accountId || a.id === accountId)).map((a) => a.id));
  const balance = p.accounts.filter((a) => ids.has(a.id)).reduce((s, a) => s + a.balance, 0);
  const protectedMoney = p.goals.filter((g) => ids.has(g.accountId)).reduce((s, g) => s + g.amount, 0);
  const remainingGoals = new Map(p.goals.map((g) => [g.id, g.amount]));
  const reserved = p.reservations.filter((r) => ids.has(r.sourceAccountId)).reduce((s, r) => {
    const goal = p.goals.find((g) => g.id === r.goalId && g.accountId === r.sourceAccountId);
    const covered = goal ? Math.min(r.amount, remainingGoals.get(goal.id) ?? 0) : 0;
    if (goal) remainingGoals.set(goal.id, (remainingGoals.get(goal.id) ?? 0) - covered);
    return s + r.amount - covered;
  }, 0);
  return Math.max(0, balance - protectedMoney - reserved);
}

export interface SourceCheck {
  fromGoal: number; fromFree: number; usesEmergencySavings: boolean; flag: string | null;
  valid: boolean; missingInputs: string[];
}

export function checkSource(p: FinancialPicture, amount: number, sourceAccountId: string, goalId?: string): SourceCheck {
  const missingInputs: string[] = [];
  const account = p.accounts.find((a) => a.id === sourceAccountId && a.ownerMemberId === p.memberId);
  if (!account || account.type === 'Credit Card') missingInputs.push('Choose an owned checking or savings account.');
  if (!validCents(amount) || amount <= 0) missingInputs.push('Enter a positive amount with at most two decimal places.');
  const goal = goalId ? p.goals.find((g) => g.id === goalId && g.accountId === sourceAccountId) : undefined;
  if (goalId && (!goal || account?.type !== 'Savings')) missingInputs.push('Choose a savings goal belonging to the selected savings account.');
  const reservedGoal = p.reservations.filter((r) => r.goalId === goalId && r.sourceAccountId === sourceAccountId).reduce((s, r) => s + r.amount, 0);
  const fromGoal = goal ? Math.min(amount, Math.max(0, goal.amount - reservedGoal)) : 0;
  const fromFree = account?.type === 'Savings' ? amount - fromGoal : 0;
  const protectedOtherGoals = p.goals.filter((g) => g.accountId === sourceAccountId && g.id !== goalId).reduce((s, g) => s + g.amount, 0);
  if (account?.type === 'Savings' && amount > account.balance - protectedOtherGoals) missingInputs.push('This would spend money protected for another savings goal or exceed this account balance.');
  return { fromGoal, fromFree, usesEmergencySavings: fromFree > 0, flag: fromFree > 0 ? EMERGENCY_SAVINGS_FLAG : null, valid: missingInputs.length === 0, missingInputs };
}
