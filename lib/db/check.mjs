// npm run db:check → tests the MongoDB connection string in .env.local (never prints it).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
const read = (name) => (env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const uri = process.env.MONGODB_URI || read('MONGODB_URI');
const dbName = process.env.MONGODB_DB || read('MONGODB_DB') || 'huddle';

if (!uri) {
  console.error('✗ MONGODB_URI is empty in .env.local');
  process.exit(1);
}
if (uri.includes('<') || uri.includes('>')) {
  console.error('✗ The connection string still has <db_password> in it. Replace it with the real password (no < >).');
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'wallet-whisperer-check' });
try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  console.log(`✓ Connected to MongoDB Atlas, database "${dbName}"`);
  console.log(`  collections: ${collections.length ? collections.join(', ') : '(none yet, created on first save)'}`);
} catch (err) {
  const msg = String(err.message || err);
  console.error('✗ Could not connect:', msg.replace(uri, '<uri>').slice(0, 200));
  if (/auth/i.test(msg)) console.error('  → Wrong username or password. Check Database Access in Atlas.');
  if (/timed out|ENOTFOUND|querySrv/i.test(msg)) console.error('  → Network: add 0.0.0.0/0 in Atlas Network Access, and check the cluster host.');
  process.exitCode = 1;
} finally {
  await client.close();
}
