import type { Change, FinancialPicture } from '../types';
import { validCents } from './money';

export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

export function financialInputs(p: FinancialPicture, changes: Change[] = []): string[] {
  const missing = [...p.missingInputs];
  const owned = (id: string) => p.accounts.find((a) => a.id === id && a.ownerMemberId === p.memberId && a.type !== 'Credit Card');
  if (!p.accounts.length) missing.push('Add a confirmed source account.');
  if (new Set(p.accounts.map((a) => a.id)).size !== p.accounts.length) missing.push('Resolve duplicate account IDs.');
  for (const a of p.accounts) {
    if (a.ownerMemberId !== p.memberId) missing.push(`Confirm ownership of ${a.nickname}.`);
    if (!Number.isSafeInteger(a.balance) || (a.limit !== undefined && !validCents(a.limit))) missing.push(`Confirm the balance for ${a.nickname} in cents.`);
    if (a.type === 'Credit Card' && a.balance > 0 && (a.minimumPayment === undefined || !validCents(a.minimumPayment))) missing.push(`Confirm the minimum payment for ${a.nickname}.`);
  }
  for (const o of p.obligations) {
    if (!owned(o.accountId) || !validCents(o.amount) || !validDate(o.nextDate)) missing.push(`Confirm account, amount and next date for ${o.name}.`);
  }
  for (const g of p.goals) {
    if (owned(g.accountId)?.type !== 'Savings' || !validCents(g.amount)) missing.push(`Link ${g.name} to an owned savings account and confirm its allocation.`);
  }
  for (const a of p.accounts.filter((a) => a.type === 'Savings')) {
    if (p.goals.filter((g) => g.accountId === a.id).reduce((s, g) => s + g.amount, 0) > a.balance) missing.push(`Goal allocations exceed ${a.nickname}'s balance.`);
  }
  if (p.paycheck && (!owned(p.paycheck.accountId) || !validCents(p.paycheck.avgAmount) || p.paycheck.avgAmount <= 0 || ![7, 14, 15, 30].includes(p.paycheck.cadenceDays) || !validDate(p.paycheck.nextDate))) missing.push('Confirm the income account, amount, cadence and next payday.');
  if (p.paycheck?.cadenceDays === 15 && (!p.paycheck.semiMonthlyDays || p.paycheck.semiMonthlyDays[0] < 1 || p.paycheck.semiMonthlyDays[1] > 31 || p.paycheck.semiMonthlyDays[0] >= p.paycheck.semiMonthlyDays[1])) missing.push('Confirm the two calendar days for semi-monthly income.');
  for (const t of p.txns) if (!owned(t.accountId) || !validCents(t.amount) || !validDate(t.date) || (t.goalAllocationUsed !== undefined && (!validCents(t.goalAllocationUsed) || t.goalAllocationUsed > t.amount))) missing.push(`Confirm account, amount and date for transaction ${t.id}.`);
  if (new Set(p.reservations.map((r) => r.id)).size !== p.reservations.length) missing.push('Resolve duplicate reservations.');
  for (const r of p.reservations) {
    if (!owned(r.sourceAccountId) || !validCents(r.amount) || !validDate(r.date)) missing.push(`Confirm reservation ${r.id}.`);
    if (r.goalId && !p.goals.some((g) => g.id === r.goalId && g.accountId === r.sourceAccountId)) missing.push(`Link reservation ${r.id} to its matching savings goal.`);
  }
  for (const c of changes) {
    if (c.date && !validDate(c.date)) missing.push('Choose a valid scenario date.');
    if (c.kind === 'cancelObligation') {
      if (!p.obligations.some((o) => o.key === c.obligationKey)) missing.push('Choose an existing obligation to cancel.');
      continue;
    }
    if (!c.sourceAccountId || !owned(c.sourceAccountId) || !Number.isSafeInteger(c.amount)) missing.push('Every scenario needs an owned source account and an amount in cents.');
    if (c.goalId && !p.goals.some((g) => g.id === c.goalId && g.accountId === c.sourceAccountId)) missing.push('A purchase goal must belong to its source account.');
    if (c.destinationAccountId && (!owned(c.destinationAccountId) || c.destinationAccountId === c.sourceAccountId || c.goalId)) missing.push('Choose a different owned destination account for a transfer.');
  }
  return [...new Set(missing)];
}
