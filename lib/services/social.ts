// Friends + household, stored in the `friendRequests` collection (server only).
//   friend    = an accepted friend request (either direction)
//   household = the owner + everyone who accepted the owner's household invite
// People are found by EXACT username only: no browsing or searching users (privacy).

import { ObjectId, MongoServerError, type WithId } from 'mongodb';
import { getDb } from '@/lib/db/mongo';
import { NO_LOGIN_MEMBERS } from '@/lib/people';
import type { UserDoc } from '@/lib/auth/users';
import type { ConnectionRequest, Connections, HouseholdMember, PersonRef } from '@/lib/types';

export interface FriendRequestDoc {
  fromUserId: ObjectId;
  toUserId: ObjectId;
  kind: 'friend' | 'household';
  role: 'spouse' | 'dependent' | null;
  status: 'pending' | 'accepted' | 'declined';
  pairKey: string; // both user ids, sorted: one pending request per pair+kind (unique index)
  createdAt: Date;
  respondedAt?: Date;
}

export const pairKey = (a: ObjectId, b: ObjectId) => [a.toHexString(), b.toHexString()].sort().join(':');

const requests = async () => (await getDb()).collection<FriendRequestDoc>('friendRequests');
const users = async () => (await getDb()).collection<UserDoc>('users');

const ref = (u: WithId<UserDoc>): PersonRef => ({ userId: u._id.toHexString(), username: u.username, name: u.name, memberId: u.memberId });

async function usersById(ids: ObjectId[]): Promise<Map<string, PersonRef>> {
  if (ids.length === 0) return new Map();
  const found = await (await users()).find({ _id: { $in: ids } }).toArray();
  return new Map(found.map((u) => [u._id.toHexString(), ref(u)]));
}

/** The household this user belongs to (as owner or member), or null. */
async function householdOwnerOf(userId: ObjectId): Promise<ObjectId | null> {
  const col = await requests();
  const asMember = await col.findOne({ kind: 'household', status: 'accepted', toUserId: userId });
  if (asMember) return asMember.fromUserId;
  const asOwner = await col.findOne({ kind: 'household', status: 'accepted', fromUserId: userId });
  return asOwner ? userId : null;
}

async function householdOf(userId: ObjectId): Promise<Connections['household']> {
  const ownerId = await householdOwnerOf(userId);
  if (!ownerId) return null;
  const accepted = await (await requests()).find({ kind: 'household', status: 'accepted', fromUserId: ownerId }).sort({ createdAt: 1 }).toArray();
  const people = await usersById([ownerId, ...accepted.map((r) => r.toUserId)]);
  const owner = people.get(ownerId.toHexString());
  if (!owner) return null;
  const members: HouseholdMember[] = [
    { ...owner, role: 'owner' },
    ...accepted.flatMap((r) => {
      const p = people.get(r.toUserId.toHexString());
      return p ? [{ ...p, role: r.role ?? 'dependent' }] : [];
    }),
    ...(owner.memberId ? NO_LOGIN_MEMBERS[owner.memberId] ?? [] : []).map((k) => ({ userId: null, username: null, name: k.name, memberId: k.memberId, role: k.role })),
  ];
  return { owner, members, iAmOwner: ownerId.equals(userId) };
}

/** Everything the Friends / Household pages need for this user. */
export async function connectionsFor(userId: ObjectId): Promise<Connections> {
  const col = await requests();
  const mine = await col.find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }).sort({ createdAt: -1 }).toArray();
  const people = await usersById([...new Set(mine.flatMap((r) => [r.fromUserId.toHexString(), r.toUserId.toHexString()]))].map((id) => new ObjectId(id)));
  const toView = (r: WithId<FriendRequestDoc>): ConnectionRequest | null => {
    const from = people.get(r.fromUserId.toHexString());
    const to = people.get(r.toUserId.toHexString());
    return from && to ? { id: r._id.toHexString(), kind: r.kind, role: r.role, from, to, status: r.status, createdAt: r.createdAt.toISOString() } : null;
  };
  const friends = mine
    .filter((r) => r.kind === 'friend' && r.status === 'accepted')
    .flatMap((r) => {
      const other = people.get((r.fromUserId.equals(userId) ? r.toUserId : r.fromUserId).toHexString());
      return other ? [other] : [];
    });
  return {
    friends: friends.filter((f, i) => friends.findIndex((x) => x.userId === f.userId) === i),
    household: await householdOf(userId),
    incoming: mine.filter((r) => r.toUserId.equals(userId) && r.status === 'pending').flatMap((r) => toView(r) ?? []),
    sent: mine.filter((r) => r.fromUserId.equals(userId)).flatMap((r) => toView(r) ?? []),
  };
}

type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

/** Send a friend or household request to an exact username. */
export async function sendRequest(
  fromUserId: ObjectId, username: string, kind: 'friend' | 'household', role: 'spouse' | 'dependent' | null,
): Promise<Result> {
  const to = await (await users()).findOne({ usernameLower: username.toLowerCase() });
  if (!to) return fail(404, `No one has the username @${username}.`);
  if (to._id.equals(fromUserId)) return fail(400, 'That’s you.');
  const col = await requests();
  const key = pairKey(fromUserId, to._id);

  if (kind === 'friend') {
    if (await col.findOne({ pairKey: key, kind: 'friend', status: 'accepted' })) return fail(409, `You and @${to.username} are already friends.`);
  } else {
    const myOwner = await householdOwnerOf(fromUserId);
    if (myOwner && !myOwner.equals(fromUserId)) return fail(403, 'Only the household owner can invite people.');
    if (await householdOwnerOf(to._id)) return fail(409, `@${to.username} is already in a household.`);
  }

  // A pending request the OTHER way? Accepting it is what they want.
  const reverse = await col.findOne({ pairKey: key, kind, status: 'pending', fromUserId: to._id });
  if (reverse) return fail(409, `@${to.username} already sent you a request. Accept it below.`);

  try {
    await col.insertOne({ fromUserId, toUserId: to._id, kind, role: kind === 'household' ? role ?? 'dependent' : null, status: 'pending', pairKey: key, createdAt: new Date() });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return fail(409, `You already sent @${to.username} a request.`);
    throw err;
  }
  return { ok: true };
}

/** Accept or decline a request sent TO this user. */
export async function respondToRequest(userId: ObjectId, requestId: string, accept: boolean): Promise<Result> {
  if (!ObjectId.isValid(requestId)) return fail(404, 'Request not found.');
  const col = await requests();
  const r = await col.findOne({ _id: new ObjectId(requestId), toUserId: userId, status: 'pending' });
  if (!r) return fail(404, 'Request not found.');
  if (accept && r.kind === 'household') {
    if (await householdOwnerOf(userId)) return fail(409, 'You’re already in a household.');
    const ownerOfSender = await householdOwnerOf(r.fromUserId);
    if (ownerOfSender && !ownerOfSender.equals(r.fromUserId)) return fail(409, 'That person is no longer a household owner.');
  }
  await col.updateOne({ _id: r._id, status: 'pending' }, { $set: { status: accept ? 'accepted' : 'declined', respondedAt: new Date() } });
  return { ok: true };
}

/** memberIds whose full picture this user may load: their own household's members. */
export async function householdMemberIds(userId: ObjectId): Promise<string[]> {
  const h = await householdOf(userId);
  return h ? h.members.flatMap((m) => (m.memberId ? [m.memberId] : [])) : [];
}
