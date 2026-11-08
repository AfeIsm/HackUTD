// POST /api/auth/login {login (username or email), password} → sets the session cookie.
// Same error for "no such user" and "wrong password", so it doesn't reveal who has an account.

import { NextResponse, type NextRequest } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { findUserByLogin, toPublicUser } from '@/lib/auth/users';
import { startSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Accounts need MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const login = typeof b.login === 'string' ? b.login : '';
  const password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
  if (!login || !password) return NextResponse.json({ error: 'Enter your username or email and password.' }, { status: 400 });

  const user = await findUserByLogin(login);
  // No user? Still spend the hashing time, so response timing doesn't reveal it.
  const ok = user ? await verifyPassword(password, user.salt, user.passwordHash) : (await hashPassword(password), false);
  if (!user || !ok) return NextResponse.json({ error: 'Wrong username/email or password.' }, { status: 401 });

  await startSession(user._id);
  return NextResponse.json({ user: toPublicUser(user) });
}
