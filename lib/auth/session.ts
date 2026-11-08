// Sessions (server only). The browser holds a random token in an httpOnly cookie; Mongo
// stores only its SHA-256 hash, so a leaked database can't be used to log in.
// A TTL index on expiresAt (lib/db/mongo.ts) makes Atlas delete expired sessions itself.

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/db/mongo';
import { SESSION_COOKIE, SESSION_DAYS } from '@/lib/auth/cookie';
import { findUserById, toPublicUser } from '@/lib/auth/users';
import type { PublicUser } from '@/lib/types';

interface SessionDoc {
  tokenHash: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

const sessions = async () => (await getDb()).collection<SessionDoc>('sessions');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Create a session and set the cookie. Call from a route handler. */
export async function startSession(userId: ObjectId): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await (await sessions()).insertOne({ tokenHash: hashToken(token), userId, createdAt: now, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // page JavaScript can't read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // http://localhost and LAN phone testing still work in dev
    path: '/',
    expires: expiresAt,
  });
}

/** Delete the session in Mongo and clear the cookie. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await (await sessions()).deleteOne({ tokenHash: hashToken(token) });
  store.delete(SESSION_COOKIE);
}

/** Who is logged in, decided by the server from the cookie. null if nobody. */
export async function currentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await (await sessions()).findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await findUserById(session.userId);
  return user ? toPublicUser(user) : null;
}
