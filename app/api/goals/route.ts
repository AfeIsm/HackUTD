// POST /api/goals {name, amount (cents), accountId} → set money aside in savings for something.
// DELETE /api/goals {id} → remove a goal you made. The money was never moved, so nothing is lost.
// Both re-run the health check: money set aside no longer counts as your emergency cushion.
// (The member comes from the session cookie, never the request body.)

import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { validCents } from '@/lib/engine/money';
import { freeSavings } from '@/lib/engine/source';
import { money0 } from '@/lib/format';
import { runHealthCheck } from '@/lib/services/health';
import { buildPicture, type SavingsGoalDoc } from '@/lib/services/picture';

// Long enough for the background huddle coach (after()) to finish.
export const maxDuration = 60;

const MAX_GOALS = 10;

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const amount = typeof b.amount === 'number' ? b.amount : NaN;
  const accountId = typeof b.accountId === 'string' ? b.accountId : '';
  if (!name || name.length > 40) return NextResponse.json({ error: 'Give the goal a name (up to 40 characters).' }, { status: 400 });
  if (!validCents(amount) || amount <= 0) return NextResponse.json({ error: 'Enter an amount to set aside.' }, { status: 400 });

  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  const account = picture.accounts.find((a) => a.id === accountId && a.type === 'Savings' && a.ownerMemberId === viewer.memberId);
  if (!account) return NextResponse.json({ error: 'Choose one of your savings accounts.' }, { status: 400 });
  if (picture.goals.length >= MAX_GOALS) return NextResponse.json({ error: `You can have up to ${MAX_GOALS} goals.` }, { status: 400 });
  if (picture.goals.some((g) => g.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: 'You already have a goal with that name.' }, { status: 409 });
  const free = freeSavings(picture, accountId);
  if (amount > free) return NextResponse.json({ error: `You only have ${money0(free)} of savings that isn't already set aside.` }, { status: 400 });

  await (await getDb()).collection<SavingsGoalDoc>('savingsGoals').insertOne({
    memberId: viewer.memberId, goalId: `goal-${randomBytes(6).toString('hex')}`, name, amount, accountId, createdAt: new Date(),
  });
  return NextResponse.json(await runHealthCheck(viewer.memberId, `${money0(amount)} set aside for ${name}`));
}

export async function DELETE(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'Which goal?' }, { status: 400 });

  const db = await getDb();
  const pledged = await db.collection('huddles').findOne({
    phase: { $ne: 'cancelled' }, participants: { $elemMatch: { memberId: viewer.memberId, goalId: id } },
  });
  if (pledged) return NextResponse.json({ error: 'A huddle pledge is using this goal. Change that pledge first.' }, { status: 409 });
  const removed = await db.collection<SavingsGoalDoc>('savingsGoals').findOneAndDelete({ memberId: viewer.memberId, goalId: id });
  if (!removed) return NextResponse.json({ error: 'Goal not found.' }, { status: 404 });
  return NextResponse.json(await runHealthCheck(viewer.memberId, `removed goal ${removed.name}`));
}
