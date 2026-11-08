// The `users` collection (server only). Unique indexes on usernameLower and email live in
// lib/db/mongo.ts, so the DATABASE rejects a duplicate username even if two people sign up
// in the same second.

import { ObjectId, MongoServerError, type WithId } from 'mongodb';
import { getDb } from '@/lib/db/mongo';
import type { PublicUser } from '@/lib/types';

export interface UserDoc {
  username: string; // as typed, shown as @username
  usernameLower: string; // UNIQUE
  email: string; // UNIQUE, stored lowercase
  name: string;
  passwordHash: string;
  salt: string;
  memberId: string | null; // links to Nessie money data (demo users now, new sign-ups in step 6)
  nessieCustomerId: string | null;
  createdAt: Date;
}

const users = async () => (await getDb()).collection<UserDoc>('users');

export function toPublicUser(u: WithId<UserDoc>): PublicUser {
  return { id: u._id.toHexString(), username: u.username, name: u.name, email: u.email, memberId: u.memberId };
}

/** Log in with a username ("alex", "@Alex") or an email. */
export async function findUserByLogin(login: string): Promise<WithId<UserDoc> | null> {
  const value = login.trim().toLowerCase();
  if (!value) return null;
  const col = await users();
  return value.includes('@') && !value.startsWith('@')
    ? col.findOne({ email: value })
    : col.findOne({ usernameLower: value.replace(/^@/, '') });
}

export async function findUserById(id: ObjectId): Promise<WithId<UserDoc> | null> {
  return (await users()).findOne({ _id: id });
}

export async function usernameTaken(username: string): Promise<boolean> {
  return (await (await users()).countDocuments({ usernameLower: username.toLowerCase() }, { limit: 1 })) > 0;
}

export type CreateUserResult = { user: WithId<UserDoc> } | { taken: 'username' | 'email' };

export async function createUser(doc: Omit<UserDoc, 'usernameLower' | 'createdAt'>): Promise<CreateUserResult> {
  const full: UserDoc = { ...doc, email: doc.email.toLowerCase(), usernameLower: doc.username.toLowerCase(), createdAt: new Date() };
  try {
    const { insertedId } = await (await users()).insertOne(full);
    return { user: { ...full, _id: insertedId } };
  } catch (err) {
    // 11000 = duplicate key: the unique index caught it.
    if (err instanceof MongoServerError && err.code === 11000) {
      return { taken: err.keyPattern && 'email' in err.keyPattern ? 'email' : 'username' };
    }
    throw err;
  }
}
