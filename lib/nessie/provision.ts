// Per-user sandbox onboarding. Never runs or changes the shared demo seed.
import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import type { UserDoc } from '../auth/users';
import type { Person } from '../people';
import { DEMO_ASOF, lookOf } from '../people';
import type { FinancialPicture } from '../types';
import type { NessieMember } from './picture';
import { toPicture } from './picture';
import fixture from './local.json';
import { demoRandom, randomProfile, type DemoProfile } from './demo-profile';

export interface MemberDoc {
  memberId: string;
  ownerUserId: ObjectId;
  person: Person;
  customerId?: string;
  status: 'pending' | 'ready' | 'failed';
  steps: Record<string, string>;
  inFlight?: string | null;
  error?: string | null;
  locked?: boolean;
  lockExpiresAt?: Date;
  profile?: DemoProfile;
  activeAccountIds?: string[];
  generation?: number;
  lastRandomizeRequestId?: string;
}

export interface PictureDoc {
  memberId: string;
  picture: FinancialPicture;
  member: NessieMember;
  source: 'nessie';
  syncedAt: Date;
}

export function nessieBase(): string {
  return (process.env.NESSIE_BASE_URL || 'https://api.nessieisreal.com').replace(/\/$/, '');
}

export async function nessieRequest<T>(path: string, body?: unknown): Promise<T> {
  const key = process.env.NESSIE_API_KEY;
  if (!key || process.env.USE_LOCAL_DATA === 'true') throw new Error('Live Nessie is required to set up new sandbox accounts.');
  const url = new URL(`${nessieBase()}${path}`);
  url.searchParams.set('key', key);
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  // Never include provider bodies/URLs: they can contain credentials or private data.
  if (!response.ok) throw new Error(`Nessie request failed (${response.status}).`);
  return await response.json() as T;
}

/** Bounded steps survive retries. Ambiguous writes require reconciliation, never blind replay. */
export async function provisionUser(userId: ObjectId, dependent?: { memberId: string; name: string }, rerandomize?: string): Promise<string> {
  const db = await getDb();
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId });
  if (!user) throw new Error('Account not found.');
  const memberId = dependent?.memberId || user.memberId || `user-${userId.toHexString()}`;
  const name = dependent?.name ?? user.name;
  const members = db.collection<MemberDoc>('members');
  const person: Person = {
    id: memberId, name, role: dependent ? 'dependent' : 'self', roleLabel: dependent ? 'Managed dependent' : 'Account owner',
    ...lookOf(name, memberId), hasAccounts: true, goals: [],
  };
  await members.updateOne({ memberId }, { $setOnInsert: {
    memberId, ownerUserId: userId, person, status: 'pending', steps: {},
  } }, { upsert: true });
  const state = await members.findOneAndUpdate(
    { memberId, ownerUserId: userId, $or: [{ locked: { $ne: true } }, { lockExpiresAt: { $lt: new Date() } }] },
    { $set: { locked: true, lockExpiresAt: new Date(Date.now() + 180_000) } }, { returnDocument: 'after' },
  );
  if (!state) throw new Error('Financial setup is already running.');
  let startedGeneration = false;
  try {
    if (rerandomize && state.lastRandomizeRequestId === rerandomize && state.status === 'ready') return memberId;
    if (state.inFlight) throw new Error('A previous Nessie write needs reconciliation before retrying.');
    if (!process.env.NESSIE_API_KEY || process.env.USE_LOCAL_DATA === 'true') {
      throw new Error('Live Nessie is required to set up new sandbox accounts.');
    }
    // A failed generation resumes its saved scenario instead of rolling again.
    if (!state.profile || (rerandomize && state.status === 'ready')) {
      const templates = Object.entries(fixture.members).filter(([id, m]) =>
        (dependent ? id === 'maya' : id !== 'maya') && m.customerId !== state.profile?.templateCustomerId);
      const pool = templates.length ? templates : Object.entries(fixture.members).filter(([id]) => dependent ? id === 'maya' : id !== 'maya');
      const [, template] = pool[Math.floor(demoRandom() * pool.length)];
      const raw = await readCustomer(template.customerId, 'Synthetic demo template');
      const profile = randomProfile(raw);
      if (rerandomize && state.status === 'ready') {
        // New accounts preserve old provider records. Only the new pair becomes spendable.
        await db.collection('demoGenerations').insertOne({ memberId, steps: state.steps,
          profile: state.profile, activeAccountIds: state.activeAccountIds, archivedAt: new Date() });
        state.steps = state.steps.customer ? { customer: state.steps.customer } : {};
      }
      state.profile = profile;
      state.generation = (state.generation ?? 0) + 1;
      await members.updateOne({ memberId }, { $set: {
        profile, steps: state.steps, generation: state.generation, status: 'pending',
        ...(rerandomize ? { lastRandomizeRequestId: rerandomize } : {}),
      } });
      startedGeneration = true;
    }
    const profile = state.profile;
    const create = async (step: string, path: string, body: unknown): Promise<string> => {
      if (state.steps[step]) return state.steps[step];
      await members.updateOne({ memberId }, { $set: { inFlight: step } });
      const result = await nessieRequest<{ objectCreated?: { _id: string } }>(path, body);
      const id = result.objectCreated?._id;
      if (!id) throw new Error('Nessie did not return a created record ID.');
      await members.updateOne({ memberId }, { $set: { [`steps.${step}`]: id, inFlight: null } });
      state.steps[step] = id;
      return id;
    };
    const customerId = await create('customer', '/customers', {
      first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' ') || 'Demo',
      address: { street_number: '800', street_name: 'W Campbell Rd', city: 'Richardson', state: 'TX', zip: '75080' },
    });
    await members.updateOne({ memberId }, { $set: { customerId } });
    if (!dependent) await db.collection<UserDoc>('users').updateOne({ _id: userId }, { $set: { nessieCustomerId: customerId } });
    const checking = await create('checking', `/customers/${customerId}/accounts`, {
      type: 'Checking', nickname: 'Demo checking', rewards: 0, balance: profile.checkingCents / 100,
    });
    const savings = await create('savings', `/customers/${customerId}/accounts`, {
      type: 'Savings', nickname: 'Demo savings', rewards: 0, balance: profile.savingsCents / 100,
    });
    for (const [i, deposit] of profile.deposits.entries()) {
      await create(`payroll${i}`, `/accounts/${checking}/deposits`, {
        medium: 'balance', transaction_date: deposit.date, status: 'completed', amount: deposit.amountCents / 100, description: deposit.description,
      });
    }
    for (const [i, bill] of profile.bills.entries()) await create(`bill${i}`, `/accounts/${checking}/bills`, {
      status: 'recurring', payee: bill.payee, nickname: bill.payee, payment_date: bill.date,
      recurring_date: bill.day, payment_amount: bill.amountCents / 100,
    });
    for (const [i, purchase] of profile.purchases.entries()) await create(`purchase${i}`, `/accounts/${checking}/purchases`, {
      merchant_id: purchase.merchantId, medium: 'balance', purchase_date: purchase.date,
      amount: purchase.amountCents / 100, status: 'completed', description: purchase.description,
    });
    if (profile.loan) await create('loan', `/accounts/${checking}/loans`, {
      type: profile.loan.type, status: 'approved', credit_score: 700, monthly_payment: profile.loan.paymentCents / 100,
      amount: profile.loan.amountCents / 100, description: profile.loan.description,
    });
    const activeAccountIds = [checking, savings];
    const member = await readCustomer(customerId, name, activeAccountIds);
    const picture = toPicture(member, person, fixture.merchants, DEMO_ASOF);
    await db.collection<PictureDoc>('financialPictures').updateOne({ memberId }, {
      $set: { memberId, picture, member, source: 'nessie', syncedAt: new Date() },
    }, { upsert: true });
    await members.updateOne({ memberId }, { $set: { status: 'ready', activeAccountIds, error: null } });
    // Publish the link only after the data is usable by financial routes.
    if (!dependent) await db.collection<UserDoc>('users').updateOne({ _id: userId }, { $set: { memberId, nessieCustomerId: customerId } });
    return memberId;
  } catch (error) {
    await members.updateOne({ memberId }, { $set: {
      status: state.status === 'ready' && !startedGeneration ? 'ready' : 'failed',
      error: error instanceof Error ? error.message : 'Financial setup failed.',
    } });
    throw error;
  } finally {
    await members.updateOne({ memberId }, { $set: { locked: false } });
  }
}

export async function readCustomer(customerId: string, name: string, activeAccountIds?: string[]): Promise<NessieMember> {
  const accounts = await nessieRequest<NessieMember['accounts']>(`/customers/${customerId}/accounts`);
  const selected = activeAccountIds ? accounts.filter((a) => activeAccountIds.includes(a._id)) : accounts;
  if (activeAccountIds && selected.length !== activeAccountIds.length) throw new Error('Nessie has not returned the complete demo account set yet.');
  const full = await Promise.all(selected.map(async (account) => {
    const [purchases, deposits, withdrawals, bills, loans] = await Promise.all([
      nessieRequest<typeof account.purchases>(`/accounts/${account._id}/purchases`),
      nessieRequest<typeof account.deposits>(`/accounts/${account._id}/deposits`),
      nessieRequest<typeof account.withdrawals>(`/accounts/${account._id}/withdrawals`),
      nessieRequest<typeof account.bills>(`/accounts/${account._id}/bills`),
      nessieRequest<typeof account.loans>(`/accounts/${account._id}/loans`),
    ]);
    return { ...account, purchases, deposits, withdrawals, bills, loans };
  }));
  return { customerId, name, accounts: full };
}
