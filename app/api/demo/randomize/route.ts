import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';
import { getDb } from '@/lib/db/mongo';
import { provisionUser } from '@/lib/nessie/provision';
import { runHealthCheck } from '@/lib/services/health';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) {
    return NextResponse.json({ error: 'A valid demo request ID is required.' }, { status: 400 });
  }
  const db = await getDb();
  // Replacing source accounts must not invalidate another person's group agreement.
  if (auth.user.memberId && await db.collection('huddles').findOne({
    'participants.memberId': auth.user.memberId, phase: { $ne: 'cancelled' },
  })) return NextResponse.json({ error: 'Cancel your current demo Huddles before randomizing their source accounts.' }, { status: 409 });
  try {
    const memberId = await provisionUser(auth.userId, undefined, body.requestId);
    return NextResponse.json(await runHealthCheck(memberId, 'randomized Nessie demo finances'));
  } catch {
    return NextResponse.json({ error: 'Demo setup did not finish. Retry to resume. Check Nessie configuration; an interrupted provider write may need reconciliation.' }, { status: 503 });
  }
}
