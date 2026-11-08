// PATCH /api/obligations {key, essential} (member from the session) → save the user's essential/non-essential tag,
// then re-run the health check.

import { NextResponse, type NextRequest } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { requireViewer } from '@/lib/auth/viewer';
import type { ObligationTagDoc } from '@/lib/services/picture';
import { buildPicture } from '@/lib/services/picture';
import { runHealthCheck } from '@/lib/services/health';

export async function PATCH(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const member = viewer.memberId;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof b.key === 'string' ? b.key : '';
  if (typeof b.essential !== 'boolean') return NextResponse.json({ error: 'essential must be true or false' }, { status: 400 });

  const { picture } = await buildPicture(member);
  const obligation = picture?.obligations.find((o) => o.key === key);
  if (!obligation) return NextResponse.json({ error: 'Unknown bill or subscription' }, { status: 404 });

  await (await getDb()).collection<ObligationTagDoc>('obligationTags').updateOne(
    { memberId: member, obligationKey: key },
    { $set: { memberId: member, obligationKey: key, essential: b.essential } },
    { upsert: true },
  );
  return NextResponse.json(await runHealthCheck(member, `you re-tagged ${obligation.name}`));
}
