// Who is asking? Decided on the SERVER from the session cookie (PLAN.md §8).
// API routes use this instead of trusting a `member` the browser sends.

import { NextResponse } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { currentUser } from '@/lib/auth/session';
import { ObjectId } from 'mongodb';
import { PEOPLE } from '@/lib/people';
import type { PublicUser } from '@/lib/types';

export interface Viewer {
  user: PublicUser;
  memberId: string; // their money data
}

/** The logged-in user (money data or not), or an error response to return as-is. */
export async function requireUser(): Promise<{ user: PublicUser; userId: ObjectId } | NextResponse> {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Accounts need MONGODB_URI' }, { status: 503 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  return { user, userId: new ObjectId(user.id) };
}

/** The logged-in viewer with money data, or an error response to return as-is. */
export async function requireViewer(): Promise<Viewer | NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const memberId = user.memberId;
  const ready = memberId && (PEOPLE.some((p) => p.id === memberId && p.hasAccounts) ||
    await (await getDb()).collection('members').findOne({ memberId, ownerUserId: auth.userId, status: 'ready' }));
  if (!memberId || !ready) {
    return NextResponse.json({ error: 'Your account isn’t linked to any money data yet.' }, { status: 403 });
  }
  return { user, memberId };
}

/**
 * Household membership alone never grants access to another account's finances.
 * Shared categories use a dedicated endpoint; a full picture is always private.
 */
export async function canSeePicture(viewer: Viewer, targetMemberId: string): Promise<boolean> {
  if (viewer.memberId === targetMemberId) return true;
  // Household sharing uses category-specific projections at /api/household.
  // A legacy broad grant must not bypass the current toggles.
  return false;
}
