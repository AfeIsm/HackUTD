// A member's full FinancialPicture = Nessie data + what they changed in the app (saved in MongoDB):
// purchases added in the app, and their essential / non-essential tag overrides.
// Server only. Works without MongoDB too (then app changes just aren't saved).

import type { FinancialPicture, Txn } from '../types';
import { getDb, mongoConfigured } from '../db/mongo';
import { loadMember, local } from '../nessie/client';
import { toPicture } from '../nessie/picture';
import { DEMO_ASOF, getPerson, PEOPLE } from '../people';

export interface AppPurchase {
  memberId: string;
  merchant: string;
  amount: number;
  from: string; // 'checking' | 'free' (savings not set aside) | a goal id
  date: string; // YYYY-MM-DD
  createdAt: Date;
}

export interface ObligationTagDoc {
  memberId: string;
  obligationKey: string;
  essential: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyAppChanges(base: FinancialPicture, purchases: AppPurchase[], tags: ObligationTagDoc[]): FinancialPicture {
  let accounts = base.accounts;
  const goalSpend: Record<string, number> = {};
  const txns: Txn[] = [];
  purchases.forEach((p, i) => {
    const isChecking = p.from === 'checking';
    const account = accounts.find((a) => a.type === (isChecking ? 'Checking' : 'Savings'));
    if (!account) return;
    const goalId = !isChecking && p.from !== 'free' ? p.from : null;
    accounts = accounts.map((a) => (a.id === account.id ? { ...a, balance: round2(a.balance - p.amount) } : a));
    if (goalId) goalSpend[goalId] = (goalSpend[goalId] ?? 0) + p.amount;
    txns.push({
      id: `app-${base.memberId}-${i + 1}`,
      accountId: account.id,
      source: isChecking ? 'checking' : 'savings',
      kind: 'purchase',
      amount: p.amount,
      date: p.date,
      description: p.merchant,
      merchant: p.merchant,
      category: goalId ? `goal:${goalId}` : undefined,
    });
  });
  const overrides = new Map(tags.map((t) => [t.obligationKey, t.essential]));
  return {
    ...base,
    accounts,
    txns: [...base.txns, ...txns],
    goals: base.goals.map((g) => ({ ...g, amount: Math.max(0, round2(g.amount - (goalSpend[g.id] ?? 0))) })),
    obligations: base.obligations.map((o) => (overrides.has(o.key) ? { ...o, essential: overrides.get(o.key) as boolean } : o)),
  };
}

export interface LoadedPicture {
  picture: FinancialPicture | null;
  source: 'nessie' | 'local' | 'none';
  saved: boolean; // true = app changes come from MongoDB
}

export async function buildPicture(memberId: string): Promise<LoadedPicture> {
  const person = PEOPLE.find((p) => p.id === memberId);
  if (!person || !person.hasAccounts) return { picture: null, source: 'none', saved: false };
  const loaded = await loadMember(memberId);
  if (!loaded) return { picture: null, source: 'none', saved: false };
  const base = toPicture(loaded.member, getPerson(memberId), local.merchants, DEMO_ASOF);

  if (!mongoConfigured()) return { picture: base, source: loaded.source, saved: false };
  try {
    const db = await getDb();
    const [purchases, tags] = await Promise.all([
      db.collection<AppPurchase>('appPurchases').find({ memberId }).sort({ createdAt: 1 }).toArray(),
      db.collection<ObligationTagDoc>('obligationTags').find({ memberId }).toArray(),
    ]);
    return { picture: applyAppChanges(base, purchases, tags), source: loaded.source, saved: true };
  } catch (err) {
    console.warn(`MongoDB unavailable for ${memberId}:`, (err as Error).message);
    return { picture: base, source: loaded.source, saved: false };
  }
}
