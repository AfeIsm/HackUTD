// GET /api/picture            → the logged-in user's FinancialPicture
// GET /api/picture?member=x   → someone else's, only if they're in your household
// (Nessie data + purchases/tags they saved in the app, from MongoDB).

import { NextResponse, type NextRequest } from 'next/server';
import { buildPicture } from '@/lib/services/picture';
import { canSeePicture, requireViewer } from '@/lib/auth/viewer';

export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const memberId = request.nextUrl.searchParams.get('member') || viewer.memberId;
  if (!(await canSeePicture(viewer, memberId))) return NextResponse.json({ error: 'That’s private.' }, { status: 403 });
  const { picture, source } = await buildPicture(memberId);
  if (!picture) return NextResponse.json({ error: 'No financial data found.' }, { status: 404 });
  return NextResponse.json({ picture, source });
}
