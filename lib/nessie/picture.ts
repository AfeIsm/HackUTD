// Nessie data → the engine's FinancialPicture.
// This is where the engine's detectors run on real transactions:
// deposits → paycheck, repeating card charges → subscriptions, + bills + loans → one obligations list.

import type { Account, Bill, FinancialPicture, Loan, Txn } from '../types';
import type { Person } from '../people';
import { toCents } from '../engine/money';
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
  _id: string; customer_id?: string; type: 'Checking' | 'Savings' | 'Credit Card'; nickname: string; balance: number;
  purchases: NessiePurchase[]; deposits: NessieMoveMoney[]; withdrawals: NessieMoveMoney[];
  bills: NessieBill[]; loans: NessieLoan[];
}
export interface NessieMember { customerId: string; name: string; accounts: NessieAccount[] }
export type MerchantMap = Record<string, { name: string; category: string }>;

// "Car loan · due 20" → the next 20th on or after asOf
export function nextDueDate(day: number, asOf: string): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Invalid due day');
  const [y, m] = asOf.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const candidate = `${asOf.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  if (candidate >= asOf) return candidate;
  const nextMonth = addMonths(`${asOf.slice(0, 8)}01`, 1);
  return nextDueDate(day, nextMonth);
}

const LOAN_TYPE: Record<string, string> = { auto: 'car', home: 'home', 'small business': 'business' };

// Accounts already created in Nessie are named "Demo checking"; people should just see "Checking".
const displayNickname = (name: string) => {
  const clean = name.replace(/^demo\s+/i, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export function toPicture(member: NessieMember, person: Person, merchants: MerchantMap, asOf: string): FinancialPicture {
  const accounts: Account[] = member.accounts.map((a) => ({
    id: a._id,
    ownerMemberId: a.customer_id && a.customer_id !== member.customerId ? '' : person.id,
    type: a.type,
    nickname: displayNickname(a.nickname),
    balance: toCents(a.balance),
    ...(a._id === person.cardAccountId ? { limit: person.cardLimit, minimumPayment: person.cardMinimumPayment } : {}),
  }));

  const missingInputs: string[] = [];
  const txns: Txn[] = [];
  const bills: Bill[] = [];
  const loans: Loan[] = [];

  for (const a of member.accounts) {
    const source = a.type === 'Savings' ? 'savings' : 'checking';
    if (a.type !== 'Credit Card') {
      for (const p of a.purchases) {
        if (p.status === 'cancelled') continue;
        if (p.status !== 'completed') { missingInputs.push(`Confirm settlement and balance effects for transaction ${p._id}.`); continue; }
        const merchant = merchants[p.merchant_id];
        txns.push({
          id: p._id, accountId: a._id, source, kind: 'purchase', amount: toCents(p.amount), date: p.purchase_date,
          description: p.description ?? merchant?.name ?? 'Purchase', merchant: merchant?.name, category: merchant?.category,
        });
      }
      for (const d of a.deposits) {
        if (d.status === 'cancelled') continue;
        if (d.status !== 'completed') { missingInputs.push(`Confirm settlement and balance effects for transaction ${d._id}.`); continue; }
        txns.push({ id: d._id, accountId: a._id, source, kind: 'deposit', amount: toCents(d.amount), date: d.transaction_date, description: d.description ?? 'Deposit' });
      }
      for (const w of a.withdrawals) {
        if (w.status === 'cancelled') continue;
        if (w.status !== 'completed') { missingInputs.push(`Confirm settlement and balance effects for transaction ${w._id}.`); continue; }
        txns.push({ id: w._id, accountId: a._id, source, kind: 'withdrawal', amount: toCents(w.amount), date: w.transaction_date, description: w.description ?? 'Withdrawal' });
      }
    }
    for (const b of a.bills) {
      if (b.status !== 'recurring' && b.status !== 'pending') continue;
      const nextDate = b.upcoming_payment_date ?? b.payment_date;
      if (!nextDate) { missingInputs.push(`Confirm the next date for ${b.payee}.`); continue; }
      bills.push({ id: b._id, accountId: a._id, payee: b.payee, amount: toCents(b.payment_amount), nextDate });
    }
    for (const l of a.loans) {
      if (l.status !== 'approved') continue;
      const due = l.description?.match(/due (\d{1,2})/);
      if (!due) { missingInputs.push(`Confirm the next due date for loan ${l._id}.`); continue; }
      const nextDate = nextDueDate(Number(due[1]), asOf);
      loans.push({ id: l._id, accountId: a._id, type: LOAN_TYPE[l.type] ?? l.type, monthlyPayment: toCents(l.monthly_payment), nextDate });
    }
  }

  const obligations = buildObligations(bills, loans, detectRecurring(txns, asOf));
  for (const card of accounts.filter((a) => a.type === 'Credit Card' && a.balance > 0)) {
    if (card.id !== person.cardAccountId || person.cardMinimumPayment === undefined || !person.cardPaymentAccountId || !person.cardPaymentDay) {
      missingInputs.push(`Confirm minimum payment, payment account and due date for ${card.nickname}.`);
      continue;
    }
    obligations.push({ key: `card:${card.id}`, accountId: person.cardPaymentAccountId, name: `${card.nickname} minimum`,
      amount: person.cardMinimumPayment, nextDate: nextDueDate(person.cardPaymentDay, asOf), cadence: 'monthly', essential: true, origin: 'cardMinimum' });
  }
  return {
    reservations: [], missingInputs,
    memberId: person.id,
    accounts,
    txns,
    paycheck: detectPaychecks(txns, asOf),
    obligations,
    goals: person.goals,
  };
}
