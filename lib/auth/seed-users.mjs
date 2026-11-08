// npm run seed:users → creates (or resets) the demo logins alex, jordan, maya, sam, linked to
// the Nessie-seeded people (memberId). Password = DEMO_PASSWORD in .env.local (never printed).
// Safe to re-run: it upserts by username and just resets the password.
// Hashing matches lib/auth/password.ts (scrypt, 16-byte salt, 64-byte key, NFKC).

import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
const read = (name) => process.env[name] || (env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const uri = read('MONGODB_URI');
const dbName = read('MONGODB_DB') || 'huddle';
const password = read('DEMO_PASSWORD');

if (!uri) throw new Error('MONGODB_URI is empty in .env.local');
if (password.length < 8) throw new Error('Set DEMO_PASSWORD (8+ characters) in .env.local');

// Same ids as lib/people.ts. Leo (10) has no login.
const DEMO = [
  { memberId: 'alex', name: 'Alex' },
  { memberId: 'jordan', name: 'Jordan' },
  { memberId: 'maya', name: 'Maya' },
  { memberId: 'sam', name: 'Sam' },
];

const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'wallet-whisperer-seed-users' }).connect();
try {
  const users = client.db(dbName).collection('users');
  await users.createIndex({ usernameLower: 1 }, { unique: true });
  await users.createIndex({ email: 1 }, { unique: true });
  for (const d of DEMO) {
    const salt = randomBytes(16);
    const passwordHash = scryptSync(password.normalize('NFKC'), salt, 64).toString('hex');
    const r = await users.updateOne(
      { usernameLower: d.memberId },
      {
        $set: { username: d.memberId, name: d.name, salt: salt.toString('hex'), passwordHash, memberId: d.memberId },
        $setOnInsert: { usernameLower: d.memberId, email: `${d.memberId}@walletwhisperer.demo`, nessieCustomerId: null, createdAt: new Date() },
      },
      { upsert: true },
    );
    console.log(`✓ @${d.memberId} ${r.upsertedCount ? 'created' : 'password reset'}`);
  }
} finally {
  await client.close();
}
