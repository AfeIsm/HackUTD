// GET /api/picture?member=alex → that member's FinancialPicture
// (Nessie data + purchases/tags they saved in the app, from MongoDB).
// Demo note: no real login yet, so any member can be requested (PLAN.md §8: demo-level privacy).

import { NextResponse, type NextRequest } from 'next/server';
import { PEOPLE } from '@/lib/people';
import { buildPicture } from '@/lib/services/picture';

export async function GET(request: NextRequest) {
  const memberId = request.nextUrl.searchParams.get('member') ?? 'alex';
  if (!PEOPLE.some((p) => p.id === memberId)) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  const { picture, source } = await buildPicture(memberId);
  return NextResponse.json({ picture, source });
}
