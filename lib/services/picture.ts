// A member's full FinancialPicture = Nessie data + what they changed in the app (saved in MongoDB):
// purchases added in the app, and their essential / non-essential tag overrides.
// Server only. Works without MongoDB too (then app changes just aren't saved).
// Money is integer cents everywhere (lib/types.ts contract).

import type { FinancialPicture, Txn } from '../types';
import { getDb, mongoConfigured } from '../db/mongo';
import { checkSource } from '../engine/source';
import { loadMember, local } from '../nessie/client';
import { toPicture } from '../nessie/picture';
import { DEMO_ASOF, getPerson, PEOPLE } from '../people';

export interface AppPurchase {
  memberId: string;
  merchant: string;
  amount: number; // cents
  sourceAccountId: string; // an account the member owns (checking or savings)
  goalId?: string; // spend this goal's allocation first
  date: string; // YYYY-MM-DD
  createdAt: Date;
}

export interface ObligationTagDoc {
  memberId: string;
  obligationKey: string;
  essential: boolean;
}

/** Apply saved purchases (in the order they were made) and tag overrides on top of the Nessie picture. */
export function applyAppChanges(base: FinancialPicture, purchases: AppPurchase[], tags: ObligationTagDoc[]): FinancialPicture {
  let picture = base;
  const txns: Txn[] = [];
  purchases.forEach((p, i) => {
    const account = picture.accounts.find((a) => a.id === p.sourceAccountId && a.ownerMemberId === base.memberId);
    if (!account || account.type === 'Credit Card') return; // stale or invalid record: skip it
    const check = checkSource(picture, p.amount, account.id, p.goalId);
    picture = {
      ...picture,
      accounts: picture.accounts.map((a) => (a.id === account.id ? { ...a, balance: a.balance - p.amount } : a)),
      goals: picture.goals.map((g) => (g.id === p.goalId ? { ...g, amount: Math.max(0, g.amount - check.fromGoal) } : g)),
    };
    txns.push({
      id: `app-${base.memberId}-${i + 1}`,
      accountId: account.id,
      source: account.type === 'Checking' ? 'checking' : 'savings',
      kind: 'purchase',
      amount: p.amount,
      goalAllocationUsed: check.fromGoal || undefined,
      date: p.date,
      description: p.merchant,
      merchant: p.merchant,
      category: p.goalId ? `goal:${p.goalId}` : undefined,
    });
  });
  const overrides = new Map(tags.map((t) => [t.obligationKey, t.essential]));
  return {
    ...picture,
    txns: [...picture.txns, ...txns],
    obligations: picture.obligations.map((o) => (overrides.has(o.key) ? { ...o, essential: overrides.get(o.key) as boolean } : o)),
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
