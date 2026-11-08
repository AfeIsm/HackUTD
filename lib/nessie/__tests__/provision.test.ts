import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { provisionUser } from '../provision';
import fixture from '../local.json';
import type { DemoProfile } from '../demo-profile';
import type { NessieMember } from '../picture';

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('../../db/mongo', () => ({ getDb: mock.getDb }));

describe('per-user Nessie provisioning', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const userId = new ObjectId();
  let member: Record<string, unknown> | null;
  let user: Record<string, unknown>;
  let snapshot: Record<string, unknown> | null;
  let writes: string[];
  let failWrite: boolean;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NESSIE_API_KEY', 'test-only');
    vi.stubEnv('USE_LOCAL_DATA', 'false');
    member = null;
    snapshot = null;
    user = { _id: userId, name: 'New Person', memberId: null };
    writes = [];
    failWrite = false;
    const accounts: NessieMember['accounts'] = [];
    const apply = (target: Record<string, unknown>, values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith('steps.')) (target.steps as Record<string, unknown>)[key.slice(6)] = value;
        else target[key] = value;
      }
    };
    mock.getDb.mockResolvedValue({ collection: (name: string) => ({
      insertOne: vi.fn(async () => ({})),
      findOne: async () => name === 'users' ? user : member,
      findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
        if (member?.locked) return null;
        apply(member!, update.$set);
        return structuredClone(member);
      },
      updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> }) => {
        if (name === 'members') {
          member ??= structuredClone(update.$setOnInsert!);
          if (update.$set) apply(member, update.$set);
        } else if (name === 'users') apply(user, update.$set!);
        else if (name === 'financialPictures') snapshot = update.$set!;
      },
    }) });
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      const path = url.pathname;
      if (init.method === 'POST') {
        writes.push(path);
        if (failWrite) throw new Error('Connection interrupted');
        const body = JSON.parse(init.body as string);
        const id = `id-${writes.length}`;
        if (path.endsWith('/accounts')) accounts.push({ ...body, _id: id, customer_id: 'id-1', purchases: [], deposits: [], withdrawals: [], bills: [], loans: [] });
        const match = path.match(/^\/accounts\/([^/]+)\/(purchases|deposits|bills|loans)$/);
        if (match) {
          const account = accounts.find((a) => a._id === match[1])!;
          (account[match[2] as 'deposits'] as unknown[]).push({ ...body, _id: id });
        }
        return Response.json({ objectCreated: { _id: id } });
      }
      const template = Object.values(fixture.members).find((m) => path === `/customers/${m.customerId}/accounts`);
      if (template) return Response.json(template.accounts);
      if (path.startsWith('/customers/')) return Response.json(accounts);
      const match = path.match(/^\/accounts\/([^/]+)\/(\w+)$/);
      if (match) {
        const templateAccounts = Object.values(fixture.members).flatMap((m) => m.accounts) as unknown as NessieMember['accounts'];
        const account = [...accounts, ...templateAccounts].find((a) => a._id === match[1]);
        if (account) return Response.json(account[match[2] as 'deposits']);
      }
      return Response.json([]);
    }));
  });

  it('stores normalized cents and publishes the user link after provisioning', async () => {
    const id = await provisionUser(userId);
    expect(user.memberId).toBe(id);
    expect(user.nessieCustomerId).toBe('id-1');
    expect(member?.status).toBe('ready');
    const profile = member!.profile as DemoProfile;
    expect(snapshot?.picture).toMatchObject({ memberId: id, accounts: [
      { balance: profile.checkingCents, ownerMemberId: id }, { balance: profile.savingsCents, ownerMemberId: id },
    ] });
    expect(writes.filter((p) => p === '/customers')).toHaveLength(1);
    const count = writes.length;
    await provisionUser(userId);
    expect(writes).toHaveLength(count); // Reuses every completed operation.
  });

  it('does not replay an ambiguous provider write', async () => {
    failWrite = true;
    await expect(provisionUser(userId)).rejects.toThrow('Connection interrupted');
    expect(member?.inFlight).toBe('customer');
    expect(user.memberId).toBeNull();
    failWrite = false;
    await expect(provisionUser(userId)).rejects.toThrow('reconciliation');
    expect(writes).toHaveLength(1);
  });

  it('can retry a missing configuration without marking a provider write ambiguous', async () => {
    vi.stubEnv('NESSIE_API_KEY', '');
    await expect(provisionUser(userId)).rejects.toThrow('Live Nessie');
    expect(member?.inFlight).toBeUndefined();
    expect(writes).toHaveLength(0);
    vi.stubEnv('NESSIE_API_KEY', 'test-only');
    await provisionUser(userId);
    expect(member?.status).toBe('ready');
  });

  it('keeps a managed dependent separate from the owner login', async () => {
    user.memberId = 'existing-owner';
    const id = await provisionUser(userId, { memberId: 'dependent-test', name: 'Child' });
    expect(id).toBe('dependent-test');
    expect(user.memberId).toBe('existing-owner');
    expect(user.nessieCustomerId).toBeUndefined();
    expect(member?.person).toMatchObject({ name: 'Child', role: 'dependent' });
    expect(writes.filter((p) => p.endsWith('/bills'))).toHaveLength(0);
  });

  it('rerandomizes only this member, archives the old generation and excludes old accounts', async () => {
    const id = await provisionUser(userId);
    const customerId = user.nessieCustomerId;
    const previousIds = [...member!.activeAccountIds as string[]];
    await provisionUser(userId, undefined, 'test-request');
    expect(user.memberId).toBe(id);
    expect(user.nessieCustomerId).toBe(customerId);
    expect(member!.activeAccountIds).not.toEqual(previousIds);
    expect((snapshot!.picture as { accounts: { id: string }[] }).accounts.map((a) => a.id)).toEqual(member!.activeAccountIds);
    expect(writes.filter((p) => p === '/customers')).toHaveLength(1);
    const count = writes.length;
    await provisionUser(userId, undefined, 'test-request');
    expect(writes).toHaveLength(count);
  });
});
