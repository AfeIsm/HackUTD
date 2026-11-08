// GET /api/picture?member=alex → that member's FinancialPicture, built from Nessie.
// Demo note: no real login yet, so any member can be requested (PLAN.md §8: demo-level privacy).

import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_ASOF, PEOPLE } from '@/lib/people';
import { loadMember, local } from '@/lib/nessie/client';
import { toPicture } from '@/lib/nessie/picture';

export async function GET(request: NextRequest) {
  const memberId = request.nextUrl.searchParams.get('member') ?? 'alex';
  const person = PEOPLE.find((p) => p.id === memberId);
  if (!person) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  if (!person.hasAccounts) return NextResponse.json({ picture: null, source: 'none' });

  const loaded = await loadMember(memberId);
  if (!loaded) return NextResponse.json({ picture: null, source: 'none' });

  const picture = toPicture(loaded.member, person, local.merchants, DEMO_ASOF);
  return NextResponse.json({ picture, source: loaded.source });
}
