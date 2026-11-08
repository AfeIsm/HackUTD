// POST /api/purchases {member, merchant, amount (cents), sourceAccountId, goalId?}
//   → save the purchase, then re-run the health check automatically
//     (PLAN.md §6: "a purchase added through our app" is a trigger).
// DELETE /api/purchases {member} → remove that member's app-added purchases (demo reset).

import { NextResponse, type NextRequest } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { checkSource } from '@/lib/engine/source';
import { validCents } from '@/lib/engine/money';
import { money0 } from '@/lib/format';
import { DEMO_ASOF, PEOPLE } from '@/lib/people';
import { buildPicture, type AppPurchase } from '@/lib/services/picture';
import { runHealthCheck } from '@/lib/services/health';

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const member = typeof b.member === 'string' ? b.member : '';
  const merchant = typeof b.merchant === 'string' ? b.merchant.trim().slice(0, 60) : '';
  const amount = typeof b.amount === 'number' ? b.amount : NaN;
  const sourceAccountId = typeof b.sourceAccountId === 'string' ? b.sourceAccountId : '';
  const goalId = typeof b.goalId === 'string' && b.goalId ? b.goalId : undefined;

  if (!PEOPLE.some((p) => p.id === member && p.hasAccounts)) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  if (!merchant || !validCents(amount) || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ error: 'Need a merchant and a positive amount in cents' }, { status: 400 });
  }

  // Same rules the engine uses: owned account, goal belongs to that account, enough money.
  const { picture } = await buildPicture(member);
  if (!picture) return NextResponse.json({ error: 'No accounts' }, { status: 404 });
  const check = checkSource(picture, amount, sourceAccountId, goalId);
  const account = picture.accounts.find((a) => a.id === sourceAccountId);
  if (!check.valid || !account) return NextResponse.json({ error: check.missingInputs.join(' ') || 'Invalid account' }, { status: 400 });
  if (amount > account.balance) return NextResponse.json({ error: 'This account doesn’t have enough money.' }, { status: 400 });

  await (await getDb()).collection<AppPurchase>('appPurchases').insertOne({
    memberId: member, merchant, amount, sourceAccountId, ...(goalId ? { goalId } : {}), date: DEMO_ASOF, createdAt: new Date(),
  });
  const where = goalId ? picture.goals.find((g) => g.id === goalId)?.name ?? 'a goal' : account.type === 'Checking' ? 'checking' : 'savings';
  return NextResponse.json(await runHealthCheck(member, `${money0(amount)} purchase at ${merchant} (from ${where})`));
}

export async function DELETE(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { member?: unknown };
  if (typeof b.member !== 'string' || !PEOPLE.some((p) => p.id === b.member)) {
    return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  }
  await (await getDb()).collection<AppPurchase>('appPurchases').deleteMany({ memberId: b.member });
  return NextResponse.json(await runHealthCheck(b.member, 'added purchases cleared'));
}
