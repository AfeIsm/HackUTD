import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';
import { getDb } from '@/lib/db/mongo';
import { provisionUser, type MemberDoc } from '@/lib/nessie/provision';
import { runHealthCheck } from '@/lib/services/health';

export const maxDuration = 120;

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const member = await (await getDb()).collection<MemberDoc>('members').findOne({ ownerUserId: auth.userId });
  return NextResponse.json({ status: member?.status ?? (auth.user.memberId ? 'ready' : 'pending'),
    needsReconciliation: Boolean(member?.inFlight), demo: true });
}

export async function POST() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  if (auth.user.memberId) return NextResponse.json({ status: 'ready', health: await runHealthCheck(auth.user.memberId, 'setup checked') });
  try {
    const memberId = await provisionUser(auth.userId);
    return NextResponse.json({ status: 'ready', health: await runHealthCheck(memberId, 'new sandbox account') });
  } catch {
    return NextResponse.json({ error: 'Financial setup could not finish. Check live Nessie configuration. An interrupted provider write may require reconciliation.' }, { status: 503 });
  }
}
