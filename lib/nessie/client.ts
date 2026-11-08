// Reads a member's accounts + transactions from Nessie (server only: uses the API key).
// Falls back to lib/nessie/local.json when USE_LOCAL_DATA=true, there's no key, or Nessie fails.

import localData from './local.json';
import type { MerchantMap, NessieAccount, NessieMember } from './picture';

const BASE = 'https://api.nessieisreal.com';

interface LocalData {
  seededAt: string;
  asOf: string;
  merchants: MerchantMap;
  members: Record<string, NessieMember>;
}
export const local = localData as unknown as LocalData;

async function nessieGet<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${key}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Nessie ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export type DataSource = 'nessie' | 'local';

export async function loadMember(memberId: string): Promise<{ member: NessieMember; source: DataSource } | null> {
  const saved = local.members[memberId];
  if (!saved) return null;

  const key = process.env.NESSIE_API_KEY;
  if (!key || process.env.USE_LOCAL_DATA === 'true') return { member: saved, source: 'local' };

  try {
    const accounts = await nessieGet<NessieAccount[]>(`/customers/${saved.customerId}/accounts`, key);
    const full = await Promise.all(
      accounts.map(async (a) => {
        const [purchases, deposits, withdrawals, bills, loans] = await Promise.all([
          nessieGet<NessieAccount['purchases']>(`/accounts/${a._id}/purchases`, key),
          nessieGet<NessieAccount['deposits']>(`/accounts/${a._id}/deposits`, key),
          nessieGet<NessieAccount['withdrawals']>(`/accounts/${a._id}/withdrawals`, key),
          nessieGet<NessieAccount['bills']>(`/accounts/${a._id}/bills`, key),
          nessieGet<NessieAccount['loans']>(`/accounts/${a._id}/loans`, key),
        ]);
        return { ...a, purchases, deposits, withdrawals, bills, loans };
      }),
    );
    return { member: { ...saved, accounts: full }, source: 'nessie' };
  } catch (err) {
    console.warn(`Nessie unavailable for ${memberId}, using local.json:`, (err as Error).message);
    return { member: saved, source: 'local' };
  }
}
