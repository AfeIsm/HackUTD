// "Transfer now": one member chooses to actually send the amount they promised.
//
// Tested against live Nessie: a balance can only be set when an account is created. Transfers,
// withdrawals and deposits just write a record, and updating an account ignores a new balance
// even though it answers "Accepted". So the balance change lives in our own data: marking this
// pledge as sent is the debit, and buildPicture subtracts it on every screen and in every score.
// One write means it can't half-happen. Nessie gets a transfer record as the paper trail.
//
// Locking never calls this. Money moves only when that person presses the button.

import { checkPledge } from '../engine/split';
import { money } from '../format';
import { nessieRequest } from '../nessie/provision';
import { DEMO_ASOF } from '../people';
import type { Viewer } from '@/lib/auth/viewer';
import { type ActionResult, fail, fromDoc, huddles, pictureWithOtherPledges } from './huddle';

export async function transferPledge(viewer: Viewer, id: string): Promise<ActionResult> {
  const col = await huddles();
  const doc = await col.findOne({ _id: id, 'participants.memberId': viewer.memberId });
  if (!doc) return fail(404, 'Huddle not found.');
  const h = fromDoc(doc);
  const memberId = viewer.memberId;
  const me = h.participants.find((p) => p.memberId === memberId);
  if (!me) return fail(404, 'Huddle not found.');
  if (h.phase !== 'locked') return fail(409, 'You can transfer once everyone has agreed and the huddle is locked.');
  if (!me.committed || !me.pledge || !me.sourceAccountId) return fail(409, 'You have nothing to transfer for this huddle.');
  if (me.transfer?.status === 'sent') return fail(409, 'You already transferred this.');
  const amount = me.pledge;
  const source = me.sourceAccountId;

  // Current money, minus what's promised elsewhere. A risky transfer is allowed; missing money isn't.
  const picture = await pictureWithOtherPledges(memberId, id);
  if (!picture) return fail(404, 'No accounts found.');
  const check = checkPledge(picture, { amount, sourceAccountId: source, ...(me.goalId ? { goalId: me.goalId } : {}) }, h.targetDate < DEMO_ASOF ? DEMO_ASOF : h.targetDate, DEMO_ASOF);
  if (!check.passed) return fail(409, check.reason);

  // Only applies if nobody changed the huddle since we read it, so a double click can't send twice.
  const sent = await col.updateOne(
    { _id: id, version: doc.version, participants: { $elemMatch: { memberId, 'transfer.status': { $ne: 'sent' } } } } as never,
    { $set: { 'participants.$.transfer': { status: 'sent', at: new Date().toISOString() }, 'participants.$.atRisk': false, 'participants.$.riskReason': null, 'participants.$.riskScore': null, updatedAt: new Date() }, $inc: { version: 1 } } as never,
  );
  if (sent.matchedCount !== 1) return fail(409, 'Lots of changes at once. Try again.');

  // Nessie truncates amounts to whole dollars, so the description carries the exact figure.
  const record = await nessieRequest<{ objectCreated?: { _id: string } }>(`/accounts/${source}/transfers`, {
    transaction_date: DEMO_ASOF, status: 'completed', amount: amount / 100, description: `Wallet Whisperer: ${money(amount)} to ${h.name.slice(0, 40)}`,
  }).catch((err: Error) => { console.warn('Nessie transfer record failed:', err.message); return null; }); // the balance change already stands
  if (record?.objectCreated?._id) {
    await col.updateOne({ _id: id, participants: { $elemMatch: { memberId } } } as never, { $set: { 'participants.$.transfer.recordId': record.objectCreated._id }, $inc: { version: 1 } } as never).catch(() => undefined);
  }
  return { ok: true };
}
