// GET  /api/friends → my friends, my household, requests to me, requests I sent
// POST /api/friends {username, kind: 'friend'|'household', role?: 'spouse'|'dependent'}
//      → send a request to that EXACT username. They accept on their own device.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';
import { cleanUsername, usernameError } from '@/lib/auth/validate';
import { connectionsFor, sendRequest } from '@/lib/services/social';

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await connectionsFor(auth.userId));
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = cleanUsername(typeof b.username === 'string' ? b.username : '');
  const kind = b.kind === 'household' ? 'household' : b.kind === 'friend' || b.kind === undefined ? 'friend' : null;
  const role = b.role === 'spouse' || b.role === 'dependent' ? b.role : null;
  if (!kind) return NextResponse.json({ error: 'kind must be friend or household' }, { status: 400 });
  const bad = usernameError(username);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const result = await sendRequest(auth.userId, username, kind, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(await connectionsFor(auth.userId), { status: 201 });
}
