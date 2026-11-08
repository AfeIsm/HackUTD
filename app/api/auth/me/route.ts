// GET /api/auth/me → the logged-in user (from the session cookie), or 401.

import { NextResponse } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { currentUser } from '@/lib/auth/session';

export async function GET() {
  const user = mongoConfigured() ? await currentUser() : null;
  return NextResponse.json({ user }, { status: user ? 200 : 401 });
}
