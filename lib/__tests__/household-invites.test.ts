import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectionsFor, sendRequest, respondToRequest, leaveHousehold } from '../services/social';

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('../db/mongo', () => ({ getDb: mock.getDb }));

describe('household invitations require recipient acceptance', () => {
  const owner = new ObjectId();
  const recipient = new ObjectId();
  const third = new ObjectId();
  const fourth = new ObjectId();
  let requests: Record<string, unknown>[];
  let sharing: Record<string, unknown>[];
  const people = [
    { _id: owner, username: 'alex', usernameLower: 'alex', memberId: 'alex', name: 'Alex' },
    { _id: recipient, username: 'sam', usernameLower: 'sam', memberId: 'sam', name: 'Sam' },
    { _id: third, username: 'jordan', usernameLower: 'jordan', memberId: 'jordan', name: 'Jordan' },
    { _id: fourth, username: 'maya', usernameLower: 'maya', memberId: 'maya', name: 'Maya' },
  ];
  function matches(record: Record<string, unknown>, query: Record<string, unknown>): boolean {
    return Object.entries(query).every(([key, value]) => {
      if (key === '$or') return (value as Record<string, unknown>[]).some((q) => matches(record, q));
      if (value instanceof ObjectId) return value.equals(record[key] as ObjectId);
      if (value && typeof value === 'object' && '$regex' in value) return typeof record[key] === 'string' && new RegExp(String(value.$regex)).test(record[key] as string);
      if (value && typeof value === 'object' && '$in' in value) return (value.$in as ObjectId[]).some((id) => id.equals(record[key] as ObjectId));
      return record[key] === value;
    });
  }
  beforeEach(() => {
    requests = [];
    sharing = [];
    mock.getDb.mockResolvedValue({ collection: (name: string) => {
      const rows = name === 'users' ? people : name === 'householdSharing' ? sharing : requests;
      return {
        findOne: async (query: Record<string, unknown>) => rows.find((r) => matches(r, query)) ?? null,
        find: (query: Record<string, unknown>) => {
          const cursor = { sort: () => cursor, toArray: async () => rows.filter((r) => matches(r, query)) };
          return cursor;
        },
        insertOne: async (r: Record<string, unknown>) => { requests.push({ ...r, _id: new ObjectId() }); },
        updateOne: async (query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
          const r = rows.find((r) => matches(r, query));
          if (r) Object.assign(r, update.$set);
        },
        deleteOne: async (query: Record<string, unknown>) => {
          const index = rows.findIndex((r) => matches(r, query));
          if (index >= 0) rows.splice(index, 1);
        },
        deleteMany: async (query: Record<string, unknown>) => {
          for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], query)) rows.splice(i, 1);
        },
      };
    } });
  });
  it('keeps a pending invite out of both households and accepts only on the recipient account', async () => {
    expect(await sendRequest(owner, 'sam', 'household', 'spouse')).toEqual({ ok: true });
    expect((await connectionsFor(owner)).household).toBeNull();
    const inbox = await connectionsFor(recipient);
    expect(inbox.household).toBeNull();
    expect(inbox.incoming).toHaveLength(1);
    const id = (requests[0]._id as ObjectId).toHexString();
    expect(await respondToRequest(owner, id, true)).toMatchObject({ ok: false, status: 404 });
    expect(await respondToRequest(recipient, id, true)).toEqual({ ok: true });
    const a = (await connectionsFor(owner)).household!;
    const b = (await connectionsFor(recipient)).household!;
    expect(a.members.map((m) => m.userId)).toEqual([owner.toHexString(), recipient.toHexString()]);
    expect(b.members).toEqual(a.members);
    expect(b.iAmOwner).toBe(false);
    expect(a.members.map((m) => m.memberId)).not.toContain('leo');
  });
  it('declining an invitation grants no household membership', async () => {
    await sendRequest(owner, 'sam', 'household', 'dependent');
    await respondToRequest(recipient, (requests[0]._id as ObjectId).toHexString(), false);
    expect((await connectionsFor(recipient)).household).toBeNull();
    expect((await connectionsFor(owner)).household).toBeNull();
  });
  it('lets a member leave, clears their consent, and keeps the friendship intact', async () => {
    await sendRequest(owner, 'sam', 'friend', null);
    await respondToRequest(recipient, (requests[0]._id as ObjectId).toHexString(), true);
    await sendRequest(owner, 'sam', 'household', 'spouse');
    await respondToRequest(recipient, (requests[1]._id as ObjectId).toHexString(), true);
    sharing.push({ _id: `${owner}:${recipient}`, settings: { balances: true } });
    expect(await leaveHousehold(recipient)).toEqual({ ok: true });
    expect(sharing).toEqual([]);
    expect((await connectionsFor(recipient)).household).toBeNull();
    expect((await connectionsFor(owner)).household).toBeNull();
    expect((await connectionsFor(recipient)).friends).toHaveLength(1);
    await sendRequest(owner, 'sam', 'household', 'spouse');
    expect((await connectionsFor(recipient)).household).toBeNull();
  });
  it('transfers ownership, resets consent, and cancels invitations sent by a departing owner', async () => {
    await sendRequest(owner, 'sam', 'household', 'spouse');
    await respondToRequest(recipient, (requests[0]._id as ObjectId).toHexString(), true);
    await sendRequest(owner, 'jordan', 'household', 'dependent');
    await respondToRequest(third, (requests[1]._id as ObjectId).toHexString(), true);
    await sendRequest(owner, 'maya', 'household', 'dependent');
    sharing.push({ _id: `${owner}:${recipient}` }, { _id: `${owner}:${third}` });
    expect(await leaveHousehold(owner)).toEqual({ ok: true });
    expect((await connectionsFor(owner)).household).toBeNull();
    const remaining = (await connectionsFor(third)).household!;
    expect(remaining.owner.userId).toBe(recipient.toHexString());
    expect(remaining.members.map((m) => m.userId)).toEqual([recipient.toHexString(), third.toHexString()]);
    expect((await connectionsFor(recipient)).household?.iAmOwner).toBe(true);
    expect((await connectionsFor(fourth)).incoming).toHaveLength(0);
    expect(sharing).toEqual([]);
  });
  it('cannot leave a household without membership', async () => {
    expect(await leaveHousehold(recipient)).toMatchObject({ ok: false, status: 404 });
  });
});
