// PATCH /api/obligations {member, key, essential} → save the user's essential/non-essential tag,
// then re-run the health check.

import { NextResponse, type NextRequest } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { PEOPLE } from '@/lib/people';
import type { ObligationTagDoc } from '@/lib/services/picture';
import { buildPicture } from '@/lib/services/picture';
import { runHealthCheck } from '@/lib/services/health';

export async function PATCH(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const member = typeof b.member === 'string' ? b.member : '';
  const key = typeof b.key === 'string' ? b.key : '';
  if (!PEOPLE.some((p) => p.id === member)) return NextResponse.json({ error: 'Unknown member' }, { status: 404 });
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
