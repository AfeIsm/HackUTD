import type { FinancialPicture } from './types';
import { money } from './format';
import { freeSavings } from './engine/source';

export function fundingOptions(p: FinancialPicture) {
  const accounts = p.accounts.filter((a) => a.ownerMemberId === p.memberId && a.type !== 'Credit Card');
  return accounts.flatMap((a) => [
    { value: `account:${a.id}`, sourceAccountId: a.id, goalId: undefined as string | undefined,
      label: `${a.nickname} (${a.type}) · ${money(a.type === 'Savings' ? freeSavings(p, a.id) : a.balance)}${a.type === 'Savings' ? ' unallocated' : ''}` },
    ...p.goals.filter((g) => g.accountId === a.id).map((g) => ({ value: `goal:${g.id}`, sourceAccountId: a.id, goalId: g.id,
      label: `${g.name} · ${a.nickname} · ${money(g.amount)} allocated` })),
  ]);
}
