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
import { readCustomer, type MemberDoc, type PictureDoc } from '../nessie/provision';

export interface AppPurchase {
  memberId: string;
  merchant: string;
  amount: number; // cents
  sourceAccountId: string; // an account the member owns (checking or savings)
  goalId?: string; // spend this goal's allocation first
  date: string; // YYYY-MM-DD
  createdAt: Date;
}

// A plan the member applied in the app ("Apply this plan"): a savings→checking move (also sent to
// Nessie as a real transfer) and/or cancelled non-essential subscriptions.
export interface AppliedPlanDoc {
  memberId: string;
  dataHash: string; // the data it was applied to (unique with planKey: no double-apply)
  planKey: string;
  move: { fromAccountId: string; toAccountId: string; amount: number } | null; // cents
  cancel: string[]; // obligation keys
  nessieTransferId: string | null;
  createdAt: Date;
}

// A savings goal the member made in the app. The money stays in savings, set aside by name.
export interface SavingsGoalDoc {
  memberId: string;
  goalId: string;
  name: string;
  amount: number; // cents
  accountId: string; // one of the member's savings accounts
  createdAt: Date;
}

export interface ObligationTagDoc {
  memberId: string;
  obligationKey: string;
  essential: boolean;
}

/** Apply saved purchases (in the order they were made) and tag overrides on top of the Nessie picture. */
export function applyAppChanges(base: FinancialPicture, purchases: AppPurchase[], tags: ObligationTagDoc[], applied: AppliedPlanDoc[] = [], savedGoals: SavingsGoalDoc[] = []): FinancialPicture {
  // Goals on accounts that no longer exist (regenerated demo finances) are skipped.
  const goals = savedGoals
    .filter((g) => base.accounts.some((a) => a.id === g.accountId && a.type === 'Savings' && a.ownerMemberId === base.memberId))
    .map((g) => ({ id: g.goalId, name: g.name, amount: g.amount, accountId: g.accountId }));
  let picture: FinancialPicture = goals.length ? { ...base, goals: [...base.goals, ...goals] } : base;
  const cancelled = new Set(applied.flatMap((a) => a.cancel));
  for (const a of applied) {
    if (!a.move) continue;
    const { fromAccountId, toAccountId, amount } = a.move;
    if (![fromAccountId, toAccountId].every((id) => picture.accounts.some((x) => x.id === id && x.ownerMemberId === base.memberId))) continue; // stale
    picture = { ...picture, accounts: picture.accounts.map((x) => x.id === fromAccountId ? { ...x, balance: x.balance - amount } : x.id === toAccountId ? { ...x, balance: x.balance + amount } : x) };
  }
  if (cancelled.size) picture = { ...picture, obligations: picture.obligations.filter((o) => !cancelled.has(o.key)) };
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
  source: 'nessie' | 'local' | 'none' | 'stale';
  saved: boolean; // true = app changes come from MongoDB
}

export async function buildPicture(memberId: string): Promise<LoadedPicture> {
  const person = PEOPLE.find((p) => p.id === memberId);
  const storedMember = mongoConfigured() ? await (await getDb()).collection<MemberDoc>('members').findOne({ memberId }) : null;
  if (storedMember) {
    const db = await getDb();
    const member = storedMember;
    if (member.status !== 'ready' || !member.customerId) return { picture: null, source: 'none', saved: false };
    let snapshot: PictureDoc | null = await db.collection<PictureDoc>('financialPictures').findOne({ memberId });
    let source: LoadedPicture['source'] = 'nessie';
    if (!snapshot || Date.now() - snapshot.syncedAt.getTime() > 30_000) {
      try {
        const raw = await readCustomer(member.customerId, member.person.name, member.activeAccountIds);
        const fresh: PictureDoc = { memberId, member: raw, picture: toPicture(raw, member.person, local.merchants, DEMO_ASOF), source: 'nessie', syncedAt: new Date() };
        await db.collection<PictureDoc>('financialPictures').updateOne({ memberId }, { $set: fresh }, { upsert: true });
        snapshot = fresh;
      } catch {
        source = 'stale';
      }
    }
    if (!snapshot) return { picture: null, source: 'none', saved: false };
    const [purchases, tags, applied, goals] = await Promise.all([
      db.collection<AppPurchase>('appPurchases').find({ memberId }).sort({ createdAt: 1 }).toArray(),
      db.collection<ObligationTagDoc>('obligationTags').find({ memberId }).toArray(),
      db.collection<AppliedPlanDoc>('appliedPlans').find({ memberId }).sort({ createdAt: 1 }).toArray(),
      db.collection<SavingsGoalDoc>('savingsGoals').find({ memberId }).sort({ createdAt: 1 }).toArray(),
    ]);
    const base = source === 'stale' ? { ...snapshot.picture,
      missingInputs: [...snapshot.picture.missingInputs, `Bank sync failed. Last successful sync: ${snapshot.syncedAt.toISOString()}. Refresh before approving spending.`],
    } : snapshot.picture;
    return { picture: applyAppChanges(base, purchases, tags, applied, goals), source, saved: true };
  }
  if (!person || !person.hasAccounts) return { picture: null, source: 'none', saved: false };
  const loaded = await loadMember(memberId);
  if (!loaded) return { picture: null, source: 'none', saved: false };
  const base = toPicture(loaded.member, getPerson(memberId), local.merchants, DEMO_ASOF);

  if (!mongoConfigured()) return { picture: base, source: loaded.source, saved: false };
  try {
    const db = await getDb();
    const [purchases, tags, applied, goals] = await Promise.all([
      db.collection<AppPurchase>('appPurchases').find({ memberId }).sort({ createdAt: 1 }).toArray(),
      db.collection<ObligationTagDoc>('obligationTags').find({ memberId }).toArray(),
      db.collection<AppliedPlanDoc>('appliedPlans').find({ memberId }).sort({ createdAt: 1 }).toArray(),
      db.collection<SavingsGoalDoc>('savingsGoals').find({ memberId }).sort({ createdAt: 1 }).toArray(),
    ]);
    return { picture: applyAppChanges(base, purchases, tags, applied, goals), source: loaded.source, saved: true };
  } catch (err) {
    console.warn(`MongoDB unavailable for ${memberId}:`, (err as Error).message);
    return { picture: base, source: loaded.source, saved: false };
  }
}
