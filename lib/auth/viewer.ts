// Who is asking? Decided on the SERVER from the session cookie (PLAN.md §8).
// API routes use this instead of trusting a `member` the browser sends.

import { NextResponse } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { currentUser } from '@/lib/auth/session';
import { HOUSEHOLD_IDS, PEOPLE } from '@/lib/people';
import type { PublicUser } from '@/lib/types';

export interface Viewer {
  user: PublicUser;
  memberId: string; // their money data
}

/** The logged-in viewer with money data, or an error response to return as-is. */
export async function requireViewer(): Promise<Viewer | NextResponse> {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Accounts need MONGODB_URI' }, { status: 503 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const memberId = user.memberId;
  if (!memberId || !PEOPLE.some((p) => p.id === memberId && p.hasAccounts)) {
    return NextResponse.json({ error: 'Your account isn’t linked to any money data yet.' }, { status: 403 });
  }
  return { user, memberId };
}

/**
 * Whose full picture may this viewer load? Yourself, and (for now) your own household, which
 * the Household page shows. Known gap: household should need an explicit sharing grant.
 */
export function canSeePicture(viewerMemberId: string, targetMemberId: string): boolean {
  if (viewerMemberId === targetMemberId) return true;
  return HOUSEHOLD_IDS.includes(viewerMemberId) && HOUSEHOLD_IDS.includes(targetMemberId);
}
