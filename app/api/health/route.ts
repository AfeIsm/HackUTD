// GET  /api/health → the logged-in user's latest saved health check (runs one if none yet)
// POST /api/health → re-run their health check now and save it
// The member always comes from the session, never from the request.

import { NextResponse } from 'next/server';
import { latestHealth, runHealthCheck } from '@/lib/services/health';
import { requireViewer } from '@/lib/auth/viewer';

// Long enough for the background huddle coach (after()) to finish.
export const maxDuration = 60;

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json(await latestHealth(viewer.memberId));
}

export async function POST() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json(await runHealthCheck(viewer.memberId, 'you re-ran the check'));
}
