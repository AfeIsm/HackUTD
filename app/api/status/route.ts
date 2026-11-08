import { connection } from 'next/server';
import { getDb } from '../../../lib/db/mongo';
import { local } from '../../../lib/nessie/client';

type DependencyStatus = 'connected' | 'not_configured' | 'unavailable' | 'fixture';

async function checkMongo(): Promise<DependencyStatus> {
  if (!process.env.MONGODB_URI?.trim() || !process.env.MONGODB_DB?.trim()) return 'not_configured';
  try {
    const db = await getDb();
    await db.command({ ping: 1 }, { timeoutMS: 5_000 });
    // Ping alone doesn't prove access to the named application database.
    // This read is harmless even before any application collections exist.
    await db.collection('members').findOne({}, { projection: { _id: 1 }, timeoutMS: 5_000 });
    return 'connected';
  } catch {
    return 'unavailable';
  }
}
async function checkNessie(): Promise<DependencyStatus> {
  if (process.env.USE_LOCAL_DATA === 'true') return 'fixture';
  const key = process.env.NESSIE_API_KEY?.trim();
  if (!key) return 'not_configured';
  try {
    // Read only. No seeding or provider writes; no silent fixture fallback.
    const base = process.env.NESSIE_BASE_URL ?? 'https://api.nessieisreal.com';
    const customer = local.members.alex.customerId;
    const url = new URL(`/customers/${customer}/accounts`, base);
    url.searchParams.set('key', key);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return 'unavailable';
    const accounts: unknown = await response.json();
    return Array.isArray(accounts) && accounts.length > 0 ? 'connected' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
export async function GET() {
  // No secret or network access during the static build.
  await connection();
  const [mongodb, nessie] = await Promise.all([checkMongo(), checkNessie()]);
  const ok = mongodb === 'connected' && nessie === 'connected';
  return Response.json({ ok, mongodb, nessie }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
