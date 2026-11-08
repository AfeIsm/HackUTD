// MongoDB Atlas connection (server only).
// One shared client per server instance: Vercel reuses warm instances, so caching the
// connection on globalThis stops every request from opening a new one.

import { MongoClient, type Db } from 'mongodb';

declare global {
  var _wwMongo: Promise<MongoClient> | undefined;
  var _wwIndexes: Promise<void> | undefined;
}

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing. Put it in .env.local.');

  globalThis._wwMongo ??= new MongoClient(uri, {
    appName: 'wallet-whisperer',
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  })
    .connect()
    .catch((err) => {
      globalThis._wwMongo = undefined; // let the next request retry
      throw err;
    });

  const db = (await globalThis._wwMongo).db(process.env.MONGODB_DB || 'walletwhisperer');
  await ensureIndexes(db);
  return db;
}

// Indexes do real work here (MLH "Best Use of MongoDB Atlas"):
//  - fixPlans unique (memberId, dataHash): the database itself guarantees one plan per data
//    fingerprint, so the same data always gets the same saved plan.
//  - healthSnapshots (memberId, createdAt desc): latest score + score history, fast.
function ensureIndexes(db: Db): Promise<void> {
  globalThis._wwIndexes ??= Promise.all([
    db.collection('members').createIndex({ memberId: 1 }, { unique: true }),
    db.collection('financialPictures').createIndex({ memberId: 1 }, { unique: true }),
    db.collection('healthSnapshots').createIndex({ memberId: 1, createdAt: -1 }),
    db.collection('fixPlans').createIndex({ memberId: 1, dataHash: 1 }, { unique: true }),
    db.collection('affordAnswers').createIndex({ memberId: 1, dataHash: 1, questionKey: 1 }, { unique: true }),
    db.collection('huddles').createIndex({ 'participants.memberId': 1 }),
    db.collection('invites').createIndex({ toId: 1, status: 1 }),
    db.collection('friendships').createIndex({ pair: 1 }, { unique: true }),
    // Accounts (F6): the database itself guarantees no two people share a username/email.
    db.collection('users').createIndex({ usernameLower: 1 }, { unique: true }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    // Sessions: lookup by token hash; TTL index → Atlas deletes expired sessions on its own.
    db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    // Friend/household requests: inbox lookups, and a PARTIAL unique index so there can only
    // be one pending request per pair of people + kind (answered ones don't count).
    // Agent answers: same question + same data fingerprint → one saved answer, no new AI call.
    db.collection('agentAnswers').createIndex({ memberId: 1, dataHash: 1, questionKey: 1 }, { unique: true }),
    db.collection('agentAnswers').createIndex({ memberId: 1, createdAt: -1 }),
    // Applied plans: one per (member, data fingerprint, plan) → a double click can't apply twice.
    db.collection('appliedPlans').createIndex({ memberId: 1, dataHash: 1, planKey: 1 }, { unique: true }),
    db.collection('friendRequests').createIndex({ toUserId: 1, status: 1 }),
    db.collection('friendRequests').createIndex({ fromUserId: 1, status: 1 }),
    db.collection('friendRequests').createIndex(
      { pairKey: 1, kind: 1 },
      { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_pair' },
    ),
  ])
    .then(() => undefined)
    .catch((err) => {
      globalThis._wwIndexes = undefined;
      throw err;
    });
  return globalThis._wwIndexes;
}
