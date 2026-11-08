import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';
import { householdForViewer, updateHouseholdSharing } from '@/lib/services/household';
import { SHARING_OPTIONS, type SharingScope } from '@/lib/household-sharing';
import { connectionsFor, leaveHousehold } from '@/lib/services/social';

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await householdForViewer(auth.userId), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const result = await leaveHousehold(auth.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(await connectionsFor(auth.userId), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input: unknown = await request.json().catch(() => null);
  const b = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (!SHARING_OPTIONS.some(({ key }) => key === b.scope) || typeof b.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Choose a valid sharing option and true or false.' }, { status: 400 });
  }
  const settings = await updateHouseholdSharing(auth.userId, b.scope as SharingScope, b.enabled);
  if (!settings) return NextResponse.json({ error: 'Accept a household invitation before sharing data.' }, { status: 409 });
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store' } });
}
