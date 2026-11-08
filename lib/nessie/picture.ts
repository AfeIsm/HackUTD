// Nessie data → the engine's FinancialPicture.
// This is where the engine's detectors run on real transactions:
// deposits → paycheck, repeating card charges → subscriptions, + bills + loans → one obligations list.

import type { Account, Bill, FinancialPicture, Loan, Txn } from '../types';
import type { Person } from '../people';
import { addMonths } from '../engine/dates';
import { detectPaychecks, detectRecurring } from '../engine/detect';
import { buildObligations } from '../engine/obligations';

// ---------- Nessie shapes (only the fields we use) ----------
export interface NessiePurchase { _id: string; merchant_id: string; purchase_date: string; amount: number; description?: string; status?: string }
export interface NessieMoveMoney { _id: string; transaction_date: string; amount: number; description?: string; status?: string }
export interface NessieBill {
  _id: string; status: string; payee: string; payment_amount: number;
  payment_date?: string; upcoming_payment_date?: string; recurring_date?: number;
}
export interface NessieLoan { _id: string; type: string; status: string; monthly_payment: number; description?: string; creation_date?: string }
export interface NessieAccount {
  _id: string; type: 'Checking' | 'Savings' | 'Credit Card'; nickname: string; balance: number;
  purchases: NessiePurchase[]; deposits: NessieMoveMoney[]; withdrawals: NessieMoveMoney[];
  bills: NessieBill[]; loans: NessieLoan[];
}
export interface NessieMember { customerId: string; name: string; accounts: NessieAccount[] }
export type MerchantMap = Record<string, { name: string; category: string }>;

// "Car loan · due 20" → the next 20th on or after asOf
export function nextDueDate(day: number, asOf: string): string {
  const [y, m] = asOf.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const candidate = `${asOf.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return candidate >= asOf ? candidate : addMonths(candidate, 1);
}

const LOAN_TYPE: Record<string, string> = { auto: 'car', home: 'home', 'small business': 'business' };

export function toPicture(member: NessieMember, person: Person, merchants: MerchantMap, asOf: string): FinancialPicture {
  const accounts: Account[] = member.accounts.map((a) => ({
    id: a._id,
    type: a.type,
    nickname: a.nickname,
    balance: a.balance,
    ...(a.type === 'Credit Card' && person.cardLimit ? { limit: person.cardLimit } : {}),
  }));

  const txns: Txn[] = [];
  const bills: Bill[] = [];
  const loans: Loan[] = [];

  for (const a of member.accounts) {
    const source = a.type === 'Savings' ? 'savings' : 'checking';
    if (a.type !== 'Credit Card') {
      for (const p of a.purchases) {
        const merchant = merchants[p.merchant_id];
        txns.push({
          id: p._id, accountId: a._id, source, kind: 'purchase', amount: p.amount, date: p.purchase_date,
          description: p.description ?? merchant?.name ?? 'Purchase', merchant: merchant?.name, category: merchant?.category,
        });
      }
      for (const d of a.deposits) {
        txns.push({ id: d._id, accountId: a._id, source, kind: 'deposit', amount: d.amount, date: d.transaction_date, description: d.description ?? 'Deposit' });
      }
      for (const w of a.withdrawals) {
        txns.push({ id: w._id, accountId: a._id, source, kind: 'withdrawal', amount: w.amount, date: w.transaction_date, description: w.description ?? 'Withdrawal' });
      }
    }
    for (const b of a.bills) {
      if (b.status !== 'recurring' && b.status !== 'pending') continue;
      const nextDate = b.upcoming_payment_date ?? b.payment_date;
      if (!nextDate) continue;
      bills.push({ id: b._id, payee: b.payee, amount: b.payment_amount, nextDate });
    }
    for (const l of a.loans) {
      if (l.status !== 'approved') continue;
      const due = l.description?.match(/due (\d{1,2})/);
      const nextDate = due ? nextDueDate(Number(due[1]), asOf) : addMonths(l.creation_date ?? asOf, 1);
      loans.push({ id: l._id, type: LOAN_TYPE[l.type] ?? l.type, monthlyPayment: l.monthly_payment, nextDate });
    }
  }

  return {
    memberId: person.id,
    accounts,
    txns,
    paycheck: detectPaychecks(txns, asOf),
    obligations: buildObligations(bills, loans, detectRecurring(txns, asOf)),
    goals: person.goals,
  };
}
