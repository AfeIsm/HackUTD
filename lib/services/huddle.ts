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
import { pledgeAdvice, type PledgeAdvice } from '../engine/pledgeAdvice';
import { validCents } from '../engine/money';
import { validDate } from '../engine/validation';
import {
  type CoachNote, type Huddle, type HuddleClientView, applyAgree, applyCancel, applyDecline, applyEdit, applyInviteAnswer, applyPledge,
  newParticipant, payers, viewFor, applyLeave, withOtherPledges,
} from '../huddles';
import type { Viewer } from '@/lib/auth/viewer';
import type { AgentStep, DeclineReason, FinancialPicture } from '@/lib/types';
import { acceptProposal, maybeAutoSearch, rejectProposal, searchBlocked, settleReview, startReview, startSearch } from '../purchase/review';
import type { PurchaseBrief, PurchaseSearch } from '../purchase/types';

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
  brief: d.brief ?? null, search: d.search ?? null, review: d.review ?? null, selected: d.selected ?? null, searchRuns: d.searchRuns ?? 0,
  proposalFeedback: d.proposalFeedback ?? [], rejectedOfferKeys: d.rejectedOfferKeys ?? [],
});

/** Server only: includes private fields. Never return this to a browser; use viewFor. */
export async function getHuddle(id: string): Promise<Huddle | null> {
  const doc = await (await huddles()).findOne({ _id: id });
  return doc ? fromDoc(doc) : null;
}
const hasMoney = async (memberId: string) => PEOPLE.some((p) => p.id === memberId && p.hasAccounts) ||
  Boolean(await (await getDb()).collection('members').findOne({ memberId, status: 'ready' }));

// A pledge that just failed its private check: Nemotron writes advice for it after the response.
export interface FailedPledge { huddleId: string; name: string; pledge: number; sourceAccountId: string; goalId?: string; targetDate: string; advice: PledgeAdvice }

export type ActionResult = { ok: true; failedPledge?: FailedPledge; startSearch?: { huddleId: string; runId: string } } | { ok: false; status: number; error: string };
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
  | { action: 'delete' }
  | { action: 'findOptions' }
  | { action: 'reviewProposal'; proposalId: string }
  | { action: 'respondProposal'; accept: boolean; reason?: string };

/** This member's money, minus what they've already promised to their OTHER huddles. Private to them. */
export async function pictureWithOtherPledges(memberId: string, huddleId: string): Promise<FinancialPicture | null> {
  const { picture } = await buildPicture(memberId);
  if (!picture) return null;
  const docs = await (await huddles()).find({ participants: { $elemMatch: { memberId, committed: true } }, phase: { $ne: 'cancelled' } }).toArray();
  return withOtherPledges(picture, docs.map(fromDoc), huddleId, DEMO_ASOF);
}

/** Each payer's capacity from THEIR picture; only the resulting amounts are stored. */
async function computeFairSplit(h: Huddle): Promise<Record<string, number>> {
  const caps: Record<string, number> = {};
  for (const p of payers(h)) {
    if (!await hasMoney(p.memberId)) continue;
    const picture = await pictureWithOtherPledges(p.memberId, h.id);
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
  const inReview = 'Finish reviewing the proposal first.';

  switch (a.action) {
    case 'findOptions': {
      if (!isCreator) return fail(403, 'Only the creator can ask for alternatives.');
      const blocked = searchBlocked(h, Date.now());
      return blocked ? fail(409, blocked) : startSearch(h, 'requested', randomBytes(4).toString('hex'), new Date().toISOString());
    }
    case 'reviewProposal': {
      if (!isCreator) return fail(403, 'Only the creator can send a proposal for review.');
      const started = startReview(h, a.proposalId);
      return typeof started === 'string' ? fail(409, started) : started;
    }
    case 'respondProposal': {
      if (!h.review || !open) return fail(409, 'There’s nothing to review right now.');
      if (!me.joined || !me.userId) return fail(409, 'Join the huddle first.');
      if (h.review.acceptedBy.includes(me.memberId)) return fail(409, 'You already accepted this proposal.');
      if (a.accept) return acceptProposal(h, me.memberId);
      const reason = (a.reason ?? '').trim().slice(0, 300);
      if (reason.length < 3) return fail(400, 'Tell Nemotron why, so it can find something better.');
      const rejected = rejectProposal(h, reason);
      return searchBlocked(rejected, Date.now())
        ? { ...rejected, message: 'Someone asked for a different option. No automatic searches are left, so the group will need to decide.' }
        : startSearch(rejected, 'rejected', randomBytes(4).toString('hex'), new Date().toISOString());
    }
    case 'leave': {
      const left = applyLeave(h, me.memberId);
      return left && settleReview(left); // the person who left may have been the last holdout
    }
    case 'delete':
      return isCreator ? null : fail(403, 'Only the owner can delete this huddle.');
    case 'answerInvite':
      if (me.joined) return fail(409, 'You’re already in this huddle.');
      if (!a.accept) {
        const left = applyLeave(h, me.memberId);
        return left && settleReview(left);
      }
      return applyInviteAnswer(h, me.memberId, true);
    case 'pledge': {
      if (!me.joined || !me.isPaying || !open) return fail(409, 'You can’t pledge right now.');
      if (!validCents(a.amount) || a.amount <= 0) return fail(400, 'Enter an amount.');
      const picture = await pictureWithOtherPledges(me.memberId, h.id); // YOUR data only, checked here on the server
      if (!picture) return fail(404, 'No accounts found.');
      const pledge = { amount: a.amount, sourceAccountId: a.sourceAccountId, ...(a.goalId ? { goalId: a.goalId } : {}) };
      return applyPledge(h, me.memberId, pledge, checkPledge(picture, pledge, h.targetDate, DEMO_ASOF), pledgeAdvice(picture, pledge, h.targetDate, DEMO_ASOF));
    }
    case 'agree':
      if (h.review) return fail(409, inReview);
      if (h.phase !== 'agreeing' || !me.committed) return fail(409, 'There’s nothing to agree to yet.');
      return applyAgree(h, me.memberId);
    case 'requestChanges':
      if (h.review) return fail(409, inReview);
      if (h.phase !== 'agreeing' || !me.isPaying) return fail(409, 'You can only request changes while everyone is agreeing.');
      if (a.reason === 'out') return applyLeave(h, me.memberId);
      return applyDecline(h, me.memberId, a.reason, a.reason === 'unfairSplit' ? await computeFairSplit(h) : null);
    case 'edit':
      if (!isCreator || !open) return fail(403, 'Only the creator can change the total or date.');
      if (h.review) return fail(409, inReview);
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
    const computed = await next(fromDoc(doc), viewer, action);
    // Revealed and short → Nemotron looks for something that fits, once per funding state.
    const result = computed && !('ok' in computed) ? maybeAutoSearch(computed, randomBytes(4).toString('hex'), Date.now()) : computed;
    if (result === null) {
      const removed = await col.deleteOne({ _id: id, version: doc.version });
      if (removed.deletedCount === 1) return { ok: true };
      continue; // A concurrent change requires rechecking permissions and membership.
    }
    if ('ok' in result) return result;
    const fields: Partial<Huddle> = { ...result };
    delete fields.id;
    const res = await col.updateOne({ _id: id, version: doc.version }, { $set: { ...fields, version: doc.version + 1, updatedAt: new Date() } });
    if (res.matchedCount === 1) {
      const mine = result.participants.find((p) => p.memberId === viewer.memberId);
      const newRun = result.search?.status === 'running' && result.search.runId !== doc.search?.runId ? { huddleId: id, runId: result.search.runId } : undefined;
      if (newRun) return { ok: true, startSearch: newRun, ...(action.action === 'pledge' && mine?.advice && mine.coachState === 'thinking' && mine.pledge && mine.sourceAccountId ? {
        failedPledge: { huddleId: id, name: result.name, pledge: mine.pledge, sourceAccountId: mine.sourceAccountId, ...(mine.goalId ? { goalId: mine.goalId } : {}), targetDate: result.targetDate, advice: mine.advice },
      } : {}) };
      if (action.action === 'pledge' && mine?.advice && mine.coachState === 'thinking' && mine.pledge && mine.sourceAccountId) {
        return { ok: true, failedPledge: {
          huddleId: id, name: result.name, pledge: mine.pledge, sourceAccountId: mine.sourceAccountId,
          ...(mine.goalId ? { goalId: mine.goalId } : {}), targetDate: result.targetDate, advice: mine.advice,
        } };
      }
      return { ok: true };
    }
    // someone else changed it in between: re-read and try again
  }
  return fail(409, 'Lots of changes at once. Try again.');
}

/**
 * Re-run the private pledge check for every commitment this member has made, against their
 * CURRENT money (called by runHealthCheck, so after every purchase, re-tag or re-run).
 * Locked huddles too: a commitment that would now leave them yellow or red gets flagged, and
 * the flag clears again if their money recovers. Only the flag changes; the pledge stays.
 */
export interface NewRisk { huddleId: string; name: string; pledge: number; sourceAccountId: string; targetDate: string }

export async function recheckCommitments(memberId: string, picture: FinancialPicture): Promise<{ atRisk: number; newlyAtRisk: NewRisk[] }> {
  const col = await huddles();
  const mine = { $elemMatch: { memberId, committed: true } };
  const docs = await col.find({ participants: mine, phase: { $ne: 'cancelled' } }).toArray();
  let atRisk = 0;
  const newlyAtRisk: NewRisk[] = [];
  const all = docs.map(fromDoc);
  for (const d of docs) {
    const p = d.participants.find((x) => x.memberId === memberId);
    if (!p?.pledge || !p.sourceAccountId) continue;
    const check = checkPledge(withOtherPledges(picture, all, d._id, DEMO_ASOF), {
      amount: p.pledge, sourceAccountId: p.sourceAccountId, ...(p.goalId ? { goalId: p.goalId } : {}),
    }, d.targetDate, DEMO_ASOF);
    // Pledged despite a warning? They already know, so only flag it if the money is now gone.
    const flag = !check.passed || (!check.safe && !p.warning);
    if (flag) atRisk++;
    const riskReason = flag ? check.reason : null;
    const riskScore = flag ? check.scoreAfter : null;
    if (Boolean(p.atRisk) === flag && (p.riskReason ?? null) === riskReason && (p.riskScore ?? null) === riskScore) continue;
    if (flag && !p.atRisk) newlyAtRisk.push({ huddleId: d._id, name: d.name, pledge: p.pledge, sourceAccountId: p.sourceAccountId, targetDate: d.targetDate });
    // Positional update touches only this member's row; bumping `version` makes any action
    // racing with it re-read instead of overwriting the flag.
    await col.updateOne({ _id: d._id, participants: mine }, {
      $set: {
        'participants.$.atRisk': flag, 'participants.$.riskReason': riskReason, 'participants.$.riskScore': riskScore, updatedAt: new Date(),
        ...(flag ? {} : { 'participants.$.coach': null }), // recovered: the old advice no longer applies
      },
      $inc: { version: 1 },
    });
  }
  return { atRisk, newlyAtRisk };
}

// Each write checks the run is still the current one, so an old run can't overwrite a newer one.
// Bumping `version` makes any action racing with it re-read instead of overwriting the search.
const currentRun = (huddleId: string, runId: string) => ({ _id: huddleId, 'search.runId': runId, 'search.status': 'running' as const });

export async function saveBrief(huddleId: string, runId: string, brief: PurchaseBrief): Promise<void> {
  await (await huddles()).updateOne(currentRun(huddleId, runId), { $set: { brief, updatedAt: new Date() }, $inc: { version: 1 } } as never);
}

export async function appendSearchStep(huddleId: string, runId: string, step: AgentStep): Promise<void> {
  await (await huddles()).updateOne(currentRun(huddleId, runId), { $push: { 'search.steps': step }, $inc: { version: 1 }, $set: { updatedAt: new Date() } } as never);
}

export async function finishSearch(huddleId: string, runId: string, patch: Partial<PurchaseSearch>): Promise<void> {
  const col = await huddles();
  const fields = Object.fromEntries(Object.entries({ status: 'done', ...patch }).map(([k, v]) => [`search.${k}`, v]));
  const update = { $set: { ...fields, updatedAt: new Date() }, $inc: { version: 1 } };
  // The top option goes straight to everyone, in the same write, as a new approval round.
  const top = patch.proposals?.[0];
  if (top) {
    const opened = await col.updateOne({ ...currentRun(huddleId, runId), phase: { $nin: ['locked', 'cancelled'] } }, {
      ...update,
      $set: { ...update.$set, review: { proposal: top, acceptedBy: [] }, message: `Everyone needs to accept or turn down: ${top.title}.`, 'participants.$[].agreed': false },
    } as never);
    if (opened.matchedCount === 1) return;
  }
  await col.updateOne(currentRun(huddleId, runId), update as never);
}

/** Store Nemotron's advice on a failed pledge, only if that same pledge is still the current one. */
export async function saveFailedPledgeCoach(f: FailedPledge, memberId: string, note: CoachNote | null): Promise<void> {
  await (await huddles()).updateOne(
    { _id: f.huddleId, participants: { $elemMatch: { memberId, pledge: f.pledge, sourceAccountId: f.sourceAccountId, coachState: 'thinking' } } },
    { $set: { 'participants.$.coach': note, 'participants.$.coachState': note ? 'ready' : 'unavailable', updatedAt: new Date() }, $inc: { version: 1 } },
  );
}

/** Store Nemotron's private plan on this member's row, only if the pledge is still at risk. */
export async function saveCoachNote(huddleId: string, memberId: string, note: CoachNote): Promise<void> {
  await (await huddles()).updateOne(
    { _id: huddleId, participants: { $elemMatch: { memberId, atRisk: true } } },
    { $set: { 'participants.$.coach': note, updatedAt: new Date() }, $inc: { version: 1 } },
  );
}
