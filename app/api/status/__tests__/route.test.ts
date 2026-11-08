import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), command: vi.fn(), findOne: vi.fn(), fetch: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../../lib/db/mongo', () => ({ getDb: mocks.getDb }));
import { GET } from '../route';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MONGODB_URI', 'mongodb://test-only.invalid');
  vi.stubEnv('MONGODB_DB', 'walletwhisperer');
  vi.stubEnv('NESSIE_API_KEY', 'test-only-key');
  vi.stubEnv('USE_LOCAL_DATA', 'false');
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.command.mockResolvedValue({ ok: 1 });
  mocks.findOne.mockResolvedValue(null);
  mocks.getDb.mockResolvedValue({ command: mocks.command, collection: () => ({ findOne: mocks.findOne }) });
  mocks.fetch.mockResolvedValue(Response.json([{ _id: 'synthetic-account' }]));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('deployment dependency check', () => {
  it('is ready only after Atlas access and live Nessie succeed', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, mongodb: 'connected', nessie: 'connected' });
    expect(mocks.findOne).toHaveBeenCalled();
  });
  it('rejects a failed database read even if ping succeeds', async () => {
    mocks.findOne.mockRejectedValue(new Error('credentials and database details'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('credentials');
  });
  it('surfaces missing variables without attempting a database connection', async () => {
    vi.stubEnv('MONGODB_URI', '');
    const response = await GET();
    expect(await response.json()).toMatchObject({ ok: false, mongodb: 'not_configured' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it('never treats fixture mode as proof of a live service connection', async () => {
    vi.stubEnv('USE_LOCAL_DATA', 'true');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ nessie: 'fixture' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('reports Nessie failures without silently substituting fixture data', async () => {
    mocks.fetch.mockRejectedValue(new Error('provider-key-is-private'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, mongodb: 'connected', nessie: 'unavailable' });
  });
});
