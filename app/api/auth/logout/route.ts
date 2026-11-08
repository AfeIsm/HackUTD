// POST /api/auth/logout → deletes the session in Mongo and clears the cookie.

import { NextResponse } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { endSession } from '@/lib/auth/session';

export async function POST() {
  if (mongoConfigured()) await endSession();
  return NextResponse.json({ ok: true });
}
