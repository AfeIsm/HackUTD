// POST /api/auth/signup {name, username, email, password} → creates the account, logs in.
// 409 + field when the username/email is taken (the unique index decides, not a pre-check).

import { NextResponse, type NextRequest } from 'next/server';
import { mongoConfigured } from '@/lib/db/mongo';
import { hashPassword } from '@/lib/auth/password';
import { createUser, toPublicUser } from '@/lib/auth/users';
import { startSession } from '@/lib/auth/session';
import { cleanUsername, emailError, nameError, passwordError, usernameError } from '@/lib/auth/validate';

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Accounts need MONGODB_URI' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const name = str(b.name).trim();
  const username = cleanUsername(str(b.username));
  const email = str(b.email).trim().toLowerCase();
  const password = str(b.password);

  const fieldErrors = {
    name: nameError(name),
    username: usernameError(username),
    email: emailError(email),
    password: passwordError(password),
  };
  const bad = Object.entries(fieldErrors).find(([, e]) => e);
  if (bad) return NextResponse.json({ error: bad[1], field: bad[0] }, { status: 400 });

  const result = await createUser({ name, username, email, ...(await hashPassword(password)), memberId: null, nessieCustomerId: null });
  if ('taken' in result) {
    const error = result.taken === 'username' ? 'That username is taken.' : 'An account with that email already exists.';
    return NextResponse.json({ error, field: result.taken }, { status: 409 });
  }
  await startSession(result.user._id);
  return NextResponse.json({ user: toPublicUser(result.user) }, { status: 201 });
}
