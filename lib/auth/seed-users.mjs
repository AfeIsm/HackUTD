// npm run seed:users → creates (or resets) the demo logins alex, jordan, maya, sam, linked to
// the Nessie-seeded people (memberId). Password = DEMO_PASSWORD in .env.local (never printed).
// Also puts Jordan (spouse) + Maya (dependent) in Alex's household. Alex and Sam are NOT
// friends: the demo shows Alex adding @sam live.
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

  // Household: Alex owns it; Jordan + Maya accepted. Same shape as lib/services/social.ts.
  const requests = client.db(dbName).collection('friendRequests');
  await requests.createIndex({ toUserId: 1, status: 1 });
  await requests.createIndex({ fromUserId: 1, status: 1 });
  await requests.createIndex({ pairKey: 1, kind: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_pair' });
  const id = async (u) => (await users.findOne({ usernameLower: u }))._id;
  const alex = await id('alex');
  for (const [u, role] of [['jordan', 'spouse'], ['maya', 'dependent']]) {
    const to = await id(u);
    const pairKey = [alex.toHexString(), to.toHexString()].sort().join(':');
    await requests.updateOne(
      { kind: 'household', fromUserId: alex, toUserId: to, status: 'accepted' },
      { $setOnInsert: { kind: 'household', fromUserId: alex, toUserId: to, role, status: 'accepted', pairKey, createdAt: new Date(), respondedAt: new Date() } },
      { upsert: true },
    );
    console.log(`✓ @${u} in Alex's household (${role})`);
  }
} finally {
  await client.close();
}
