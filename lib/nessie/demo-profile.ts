import { randomInt } from 'node:crypto';
import { toCents } from '../engine/money';
import type { NessieMember } from './picture';

// Saved before any writes so retrying setup reuses exactly the same random scenario.
export interface DemoProfile {
  templateCustomerId: string;
  checkingCents: number;
  savingsCents: number;
  deposits: { date: string; amountCents: number; description: string }[];
  bills: { payee: string; date: string; day: number; amountCents: number }[];
  purchases: { merchantId: string; date: string; amountCents: number; description: string }[];
  loan?: { type: string; amountCents: number; paymentCents: number; description: string };
}

export const demoRandom = () => randomInt(0, 1_000_000) / 1_000_000;

/** Vary our own synthetic Nessie records; never use another application's user data. */
export function randomProfile(member: NessieMember, random = demoRandom): DemoProfile {
  const scale = (dollars: number, low = 0.7, high = 1.4) => Math.max(1, Math.round(toCents(dollars) * (low + random() * (high - low))));
  const checking = member.accounts.find((a) => a.type === 'Checking');
  const savings = member.accounts.find((a) => a.type === 'Savings');
  if (!checking || !savings) throw new Error('Demo template needs checking and savings accounts.');
  const deposits = checking.deposits.filter((d) => d.status === 'completed').sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)).slice(-4);
  if (deposits.length < 2) throw new Error('Demo template needs recurring income history.');
  // One fixed amount for all payroll occurrences preserves a detectable cadence.
  const payroll = scale(deposits[deposits.length - 1].amount);
  const groups = new Map<string, typeof checking.purchases>();
  for (const p of checking.purchases.filter((p) => p.status === 'completed')) {
    groups.set(p.merchant_id, [...(groups.get(p.merchant_id) ?? []), p]);
  }
  const recurring = [...groups.values()].filter((g) => g.length >= 2 &&
    g.every((p) => Math.abs(p.amount - g[0].amount) <= g[0].amount * 0.1)).slice(0, 2);
  const purchases = recurring.flatMap((group) => {
    const amountCents = scale(group[0].amount, 0.6, 2);
    return [...group].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date)).slice(-2).map((p) => ({
      merchantId: p.merchant_id, date: p.purchase_date, amountCents, description: p.description ?? 'Demo subscription',
    }));
  });
  const loan = checking.loans.find((l) => l.status === 'approved' && /due \d/.test(l.description ?? '') &&
    'amount' in l && typeof l.amount === 'number' && l.amount > 0);
  return {
    templateCustomerId: member.customerId,
    checkingCents: scale(checking.balance, 0.25, 3),
    savingsCents: scale(savings.balance, 0.25, 2),
    deposits: deposits.map((d) => ({ date: d.transaction_date, amountCents: payroll, description: 'DEMO PAYROLL' })),
    bills: checking.bills.filter((b) => ['recurring', 'pending'].includes(b.status)).slice(0, 4).map((b) => {
      const date = b.upcoming_payment_date ?? b.payment_date;
      if (!date) throw new Error('Demo template bill is missing its due date.');
      return { payee: b.payee, date, day: b.recurring_date ?? Number(date.slice(8)), amountCents: scale(b.payment_amount) };
    }),
    purchases,
    ...(loan ? { loan: { type: loan.type, paymentCents: scale(loan.monthly_payment),
      amountCents: toCents((loan as typeof loan & { amount: number }).amount), description: loan.description! } } : {}),
  };
}
