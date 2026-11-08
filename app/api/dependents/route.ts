import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/viewer';

export async function POST() {
  const viewer = await requireUser();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json({ error: 'Household members must have an account. Invite the dependent by username so they can accept and choose what to share.' }, { status: 409 });
}
