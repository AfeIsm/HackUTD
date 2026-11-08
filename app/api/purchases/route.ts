// POST /api/purchases {member, merchant, amount, from} → save the purchase, then re-run the
// health check automatically (PLAN.md §6: "a purchase added through our app" is a trigger).

import { NextResponse, type NextRequest } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { money0 } from '@/lib/format';
import { DEMO_ASOF, PEOPLE, getPerson } from '@/lib/people';
import type { AppPurchase } from '@/lib/services/picture';
import { runHealthCheck } from '@/lib/services/health';

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const member = typeof b.member === 'string' ? b.member : '';
  const merchant = typeof b.merchant === 'string' ? b.merchant.trim().slice(0, 60) : '';
  const amount = Math.round(Number(b.amount) * 100) / 100;
  const from = typeof b.from === 'string' ? b.from : 'checking';
  const person = PEOPLE.find((p) => p.id === member);
  if (!person?.hasAccounts) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  if (!merchant || !(amount > 0) || amount > 100000) return NextResponse.json({ error: 'Need a merchant and a positive amount' }, { status: 400 });
  if (from !== 'checking' && from !== 'free' && !person.goals.some((g) => g.id === from)) {
    return NextResponse.json({ error: 'Unknown account' }, { status: 400 });
  }

  await (await getDb()).collection<AppPurchase>('appPurchases').insertOne({
    memberId: member, merchant, amount, from, date: DEMO_ASOF, createdAt: new Date(),
  });
  const where = from === 'checking' ? 'checking' : from === 'free' ? 'savings' : getPerson(member).goals.find((g) => g.id === from)?.name ?? 'savings';
  return NextResponse.json(await runHealthCheck(member, `${money0(amount)} purchase at ${merchant} (from ${where})`));
}

// DELETE /api/purchases {member} → remove this member's app-added purchases (reset the demo)
export async function DELETE(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { member?: unknown };
  if (typeof b.member !== 'string' || !PEOPLE.some((p) => p.id === b.member)) {
    return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  }
  await (await getDb()).collection<AppPurchase>('appPurchases').deleteMany({ memberId: b.member });
  return NextResponse.json(await runHealthCheck(b.member, 'added purchases cleared'));
}
