// GET  /api/health?member=alex   → latest saved health check (runs one if none yet)
// POST /api/health {member}      → re-run the health check now and save it

import { NextResponse, type NextRequest } from 'next/server';
import { PEOPLE } from '@/lib/people';
import { latestHealth, runHealthCheck } from '@/lib/services/health';

const known = (id: unknown): id is string => typeof id === 'string' && PEOPLE.some((p) => p.id === id);

export async function GET(request: NextRequest) {
  const member = request.nextUrl.searchParams.get('member');
  if (!known(member)) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  return NextResponse.json(await latestHealth(member));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { member?: unknown };
  if (!known(body.member)) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
  return NextResponse.json(await runHealthCheck(body.member, 'you re-ran the check'));
}
