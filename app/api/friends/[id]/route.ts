// PATCH /api/friends/:id {accept: boolean} → answer a request that was sent to me.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';
import { connectionsFor, respondToRequest, removeFriend } from '@/lib/services/social';

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/friends/[id]'>) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as { accept?: unknown };
  if (typeof b.accept !== 'boolean') return NextResponse.json({ error: 'accept must be true or false' }, { status: 400 });

  const result = await respondToRequest(auth.userId, id, b.accept);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(await connectionsFor(auth.userId));
}

// DELETE /api/friends/:id uses the friend's USER ID, not a request ID.
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/friends/[id]'>) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const result = await removeFriend(auth.userId, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(await connectionsFor(auth.userId));
}
