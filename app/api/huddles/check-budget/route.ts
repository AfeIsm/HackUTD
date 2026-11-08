// POST /api/huddles/check-budget {name, amount (cents), targetDate, people}
//   → is this amount realistic for this plan? { check: null } means no opinion.
// Only the plan's own name is searched: nothing about anyone's money is involved.

import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { validCents } from '@/lib/engine/money';
import { checkBudget } from '@/lib/purchase/viability';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  const amount = typeof b.amount === 'number' ? b.amount : NaN;
  if (name.length < 3 || !validCents(amount) || amount <= 0) return NextResponse.json({ error: 'Need a plan name and an amount.' }, { status: 400 });
  const people = typeof b.people === 'number' && Number.isInteger(b.people) ? b.people : 2;
  const targetDate = typeof b.targetDate === 'string' ? b.targetDate : '';
  try {
    return NextResponse.json({ check: await checkBudget({ name, amount, targetDate, people }) });
  } catch (err) {
    console.warn('Budget check failed:', (err as Error).message);
    return NextResponse.json({ check: null }); // a failed check must never stop someone creating a huddle
  }
}
