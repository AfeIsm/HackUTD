// Huddles in MongoDB (server only). One document per huddle with its participants embedded,
// so every action is ONE atomic update. A `version` field guards against two phones acting
// at the same moment: the update only applies if nobody changed the huddle in between
// (optimistic locking), otherwise we re-read and retry.
// The browser only ever receives viewFor(huddle, viewer): the privacy filter runs HERE.

import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { DEMO_ASOF, PEOPLE } from '../people';
import { buildPicture } from './picture';
import { connectionsFor } from './social';
import { capacity, checkPledge, fairSplit } from '../engine/split';
import { validCents } from '../engine/money';
import { validDate } from '../engine/validation';
import {
  type Huddle, type HuddleClientView, applyAgree, applyCancel, applyDecline, applyEdit, applyInviteAnswer, applyPledge,
  newParticipant, payers, viewFor, applyLeave,
} from '../huddles';
import type { Viewer } from '@/lib/auth/viewer';
import type { DeclineReason } from '@/lib/types';

interface HuddleDoc extends Omit<Huddle, 'id'> {
  _id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const huddles = async () => (await getDb()).collection<HuddleDoc>('huddles');
const fromDoc = (d: HuddleDoc): Huddle => ({
  id: d._id, name: d.name, totalCost: d.totalCost, targetDate: d.targetDate, createdBy: d.createdBy, phase: d.phase,
  round: d.round, message: d.message, lastDecline: d.lastDecline, fairSplit: d.fairSplit ?? null, participants: d.participants,
});
const hasMoney = async (memberId: string) => PEOPLE.some((p) => p.id === memberId && p.hasAccounts) ||
  Boolean(await (await getDb()).collection('members').findOne({ memberId, status: 'ready' }));

export type ActionResult = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): ActionResult => ({ ok: false, status, error });

/** Every huddle the viewer is in (joined or invited), privacy-filtered for them. */
export async function listHuddles(memberId: string): Promise<HuddleClientView[]> {
  const docs = await (await huddles()).find({ 'participants.memberId': memberId }).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => viewFor(fromDoc(d), memberId));
}

export interface CreateInput {
  name: string;
  totalCost: number;
  targetDate: string;
  members: { memberId: string; isPaying: boolean }[];
}

/** Only you, your household and accepted friends can be added. Friends get an invite. */
export async function createHuddle(viewer: Viewer, input: CreateInput): Promise<{ id: string } | { error: string; status: number }> {
  const name = input.name.trim();
  if (!name || name.length > 60) return { status: 400, error: 'Give the huddle a name (up to 60 characters).' };
  if (!validCents(input.totalCost) || input.totalCost <= 0 || input.totalCost > 100_000_000) return { status: 400, error: 'Enter a total cost.' };
  if (!validDate(input.targetDate) || input.targetDate < DEMO_ASOF) return { status: 400, error: 'Pick a pay-by date in the future.' };

  const conn = await connectionsFor(new ObjectId(viewer.user.id));
  const allowed = new Map<string, { userId: string | null; name: string; joined: boolean }>();
  allowed.set(viewer.memberId, { userId: viewer.user.id, name: viewer.user.name, joined: true });
  for (const m of conn.household?.members ?? []) if (m.memberId) allowed.set(m.memberId, { userId: m.userId, name: m.name, joined: true });
  for (const f of conn.friends) if (f.memberId && !allowed.has(f.memberId)) allowed.set(f.memberId, { userId: f.userId, name: f.name, joined: false });

  const chosen = new Map(input.members.map((m) => [m.memberId, m.isPaying]));
  chosen.set(viewer.memberId, chosen.get(viewer.memberId) ?? true); // the creator is always in it
  const participants = [];
  for (const [memberId, isPaying] of chosen) {
    const who = allowed.get(memberId);
    if (!who) return { status: 403, error: 'You can only add your household and friends who accepted your request.' };
    // No money data → can come along, can't pay.
    participants.push(newParticipant(memberId, who.userId, who.name, { joined: who.joined, isPaying: isPaying && await hasMoney(memberId) }));
  }
  if (!participants.some((p) => p.isPaying)) return { status: 400, error: 'At least one person has to pay.' };
  if (participants.length < 2) return { status: 400, error: 'Add at least one other person to create a huddle.' };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'huddle';
  const id = `${slug}-${randomBytes(3).toString('hex')}`;
  const now = new Date();
  await (await huddles()).insertOne({
    _id: id, name, totalCost: input.totalCost, targetDate: input.targetDate, createdBy: viewer.memberId,
    phase: 'pledging', round: 1, message: null, lastDecline: null, fairSplit: null, participants,
    version: 1, createdAt: now, updatedAt: now,
  });
  return { id };
}

export type HuddleAction =
  | { action: 'answerInvite'; accept: boolean }
  | { action: 'pledge'; amount: number; sourceAccountId: string; goalId?: string }
  | { action: 'agree' }
  | { action: 'requestChanges'; reason: DeclineReason }
  | { action: 'edit'; totalCost?: number; targetDate?: string }
  | { action: 'cancel' }
  | { action: 'leave' }
  | { action: 'delete' };

/** Each payer's capacity from THEIR picture; only the resulting amounts are stored. */
async function computeFairSplit(h: Huddle): Promise<Record<string, number>> {
  const caps: Record<string, number> = {};
  for (const p of payers(h)) {
    if (!await hasMoney(p.memberId)) continue;
    const { picture } = await buildPicture(p.memberId);
    if (picture) caps[p.memberId] = capacity(picture, h.targetDate, DEMO_ASOF);
  }
  return fairSplit(h.totalCost, caps);
}

/** Work out the next huddle for one action, or why it isn't allowed. */
async function next(h: Huddle, viewer: Viewer, a: HuddleAction): Promise<Huddle | ActionResult | null> {
  const me = h.participants.find((p) => p.memberId === viewer.memberId);
  if (!me) return fail(404, 'Huddle not found.');
  const open = h.phase !== 'locked' && h.phase !== 'cancelled';
  const isCreator = h.createdBy === viewer.memberId;

  switch (a.action) {
    case 'leave':
      return applyLeave(h, me.memberId);
    case 'delete':
      return isCreator ? null : fail(403, 'Only the owner can delete this huddle.');
    case 'answerInvite':
      if (me.joined) return fail(409, 'You’re already in this huddle.');
      return a.accept ? applyInviteAnswer(h, me.memberId, true) : applyLeave(h, me.memberId);
    case 'pledge': {
      if (!me.joined || !me.isPaying || !open) return fail(409, 'You can’t pledge right now.');
      if (!validCents(a.amount) || a.amount <= 0) return fail(400, 'Enter an amount.');
      const { picture } = await buildPicture(me.memberId); // YOUR data only, checked here on the server
      if (!picture) return fail(404, 'No accounts found.');
      const pledge = { amount: a.amount, sourceAccountId: a.sourceAccountId, ...(a.goalId ? { goalId: a.goalId } : {}) };
      return applyPledge(h, me.memberId, pledge, checkPledge(picture, pledge, h.targetDate, DEMO_ASOF));
    }
    case 'agree':
      if (h.phase !== 'agreeing' || !me.committed) return fail(409, 'There’s nothing to agree to yet.');
      return applyAgree(h, me.memberId);
    case 'requestChanges':
      if (h.phase !== 'agreeing' || !me.isPaying) return fail(409, 'You can only request changes while everyone is agreeing.');
      if (a.reason === 'out') return applyLeave(h, me.memberId);
      return applyDecline(h, me.memberId, a.reason, a.reason === 'unfairSplit' ? await computeFairSplit(h) : null);
    case 'edit':
      if (!isCreator || !open) return fail(403, 'Only the creator can change the total or date.');
      if (a.totalCost !== undefined && (!validCents(a.totalCost) || a.totalCost <= 0)) return fail(400, 'Enter a total cost.');
      if (a.targetDate !== undefined && (!validDate(a.targetDate) || a.targetDate < DEMO_ASOF)) return fail(400, 'Pick a future date.');
      return applyEdit(h, { totalCost: a.totalCost, targetDate: a.targetDate });
    case 'cancel':
      if (!isCreator || !open) return fail(403, 'Only the creator can cancel.');
      return applyCancel(h);
  }
}

export async function actOnHuddle(viewer: Viewer, id: string, action: HuddleAction): Promise<ActionResult> {
  const col = await huddles();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await col.findOne({ _id: id, 'participants.memberId': viewer.memberId });
    if (!doc) return fail(404, 'Huddle not found.');
    const result = await next(fromDoc(doc), viewer, action);
    if (result === null) {
      const removed = await col.deleteOne({ _id: id, version: doc.version });
      if (removed.deletedCount === 1) return { ok: true };
      continue; // A concurrent change requires rechecking permissions and membership.
    }
    if ('ok' in result) return result;
    const fields: Partial<Huddle> = { ...result };
    delete fields.id;
    const res = await col.updateOne({ _id: id, version: doc.version }, { $set: { ...fields, version: doc.version + 1, updatedAt: new Date() } });
    if (res.matchedCount === 1) return { ok: true };
    // someone else changed it in between: re-read and try again
  }
  return fail(409, 'Lots of changes at once. Try again.');
}
