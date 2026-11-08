// GET /api/users/check?username=alex → { available: boolean, error? }
// Only says yes/no for one exact name: no listing or searching users (privacy).

import { NextResponse, type NextRequest } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { usernameTaken } from '@/lib/auth/users';
import { cleanUsername, usernameError } from '@/lib/auth/validate';

export async function GET(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Accounts need MONGODB_URI' }, { status: 503 });
  const username = cleanUsername(request.nextUrl.searchParams.get('username') ?? '');
  const error = usernameError(username);
  if (error) return NextResponse.json({ available: false, error });
  return NextResponse.json({ available: !(await usernameTaken(username)) });
}
