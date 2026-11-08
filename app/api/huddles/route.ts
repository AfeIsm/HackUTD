// GET  /api/huddles → my huddles + huddle invites, privacy-filtered for me
// POST /api/huddles {name, totalCost (cents), targetDate, members: [{memberId, isPaying}]}
//      → create; household joins right away, friends get an invite on their device

import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { createHuddle, listHuddles } from '@/lib/services/huddle';

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json({ huddles: await listHuddles(viewer.memberId) });
}

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const members = Array.isArray(b.members)
    ? b.members.flatMap((m) =>
        m && typeof m === 'object' && typeof (m as { memberId?: unknown }).memberId === 'string'
          ? [{ memberId: (m as { memberId: string }).memberId, isPaying: (m as { isPaying?: unknown }).isPaying !== false }]
          : [],
      )
    : [];
  const result = await createHuddle(viewer, {
    name: typeof b.name === 'string' ? b.name : '',
    totalCost: typeof b.totalCost === 'number' ? b.totalCost : NaN,
    targetDate: typeof b.targetDate === 'string' ? b.targetDate : '',
    members,
    brief: b.brief,
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id, huddles: await listHuddles(viewer.memberId) }, { status: 201 });
}
