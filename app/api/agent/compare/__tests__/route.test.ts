import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { alex, ASOF } from '../../../../../lib/engine/__tests__/fixtures';
import type { FinancialPicture } from '../../../../../lib/types';
import type { BuyQuestion } from '../../../../../lib/agent/buyOptions';
import type { ComparisonEvent } from '../../../../../lib/agent/compare';
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), picture: vi.fn(), id: vi.fn(), cached: vi.fn(), reserve: vi.fn(), run: vi.fn() }));
vi.mock('../../../../../lib/auth/viewer', () => ({ requireViewer: mocks.viewer }));
vi.mock('../../../../../lib/services/picture', () => ({ buildPicture: mocks.picture }));
vi.mock('../../../../../lib/agent/compare', () => ({ comparisonId: mocks.id, comparisonCached: mocks.cached, reserveComparisonRun: mocks.reserve, runComparison: mocks.run }));
import { POST } from '../route';
const purchase = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
const request = (body: unknown) => new NextRequest('http://localhost/api/agent/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.viewer.mockResolvedValue({ memberId: alex.memberId });
  mocks.picture.mockResolvedValue({ picture: alex });
  mocks.id.mockReturnValue('private-answer');
  mocks.cached.mockReturnValue(false);
  mocks.reserve.mockReturnValue(true);
  mocks.run.mockImplementation(async (_member: string, _picture: FinancialPicture, _purchases: BuyQuestion[], send: (event: ComparisonEvent) => void) => {
    send({ type: 'scenarios', scenarios: [] });
    send({ type: 'done', recommendation: { id: null, why: 'Protect your bills for now.', source: 'engine' }, searchMessage: null });
  });
});
describe('private purchase comparisons', () => {
  it('requires a session before accessing financial data', async () => {
    mocks.viewer.mockResolvedValue(NextResponse.json({ error: 'Sign in.' }, { status: 401 }));
    expect((await POST(request(purchase))).status).toBe(401);
    expect(mocks.picture).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('uses the session member and ignores forged viewer or scenario data', async () => {
    const response = await POST(request({ ...purchase, viewerId: 'another-person', memberId: 'another-person', scenarios: [{ score: 100 }], recommendation: 'now' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain('"type":"done"');
    expect(mocks.picture).toHaveBeenCalledWith(alex.memberId);
    expect(mocks.run.mock.calls[0][0]).toBe(alex.memberId);
    expect(mocks.run.mock.calls[0][2]).toEqual([purchase]);
  });
  it('accepts a normalized basket and keeps every requested item and date', async () => {
    const second = { ...purchase, label: '  Desk  ', cost: 25000, date: '2026-11-21' };
    const response = await POST(request({ purchases: [purchase, second], memberId: 'forged-member', scenarios: [{ score: 100 }] }));
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.id).toHaveBeenCalledWith(alex.memberId, alex, [purchase, { ...second, label: 'Desk' }]);
    expect(mocks.run.mock.calls[0][2]).toEqual([purchase, { ...second, label: 'Desk' }]);
    expect(mocks.run.mock.calls[0][0]).toBe(alex.memberId);
  });
  it.each(['another-person-account', 'a3'])('rejects unowned and credit-card funding: %s', async (sourceAccountId) => {
    expect((await POST(request({ ...purchase, sourceAccountId }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('rejects a goal that does not belong to the selected savings account', async () => {
    expect((await POST(request({ ...purchase, goalId: 'orlando' }))).status).toBe(400);
    expect((await POST(request({ ...purchase, sourceAccountId: 'a2', goalId: 'foreign-goal' }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([null, [], { ...purchase, cost: 10.5 }, { ...purchase, date: '2028-01-01' }])('rejects invalid requests before reading accounts: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.picture).not.toHaveBeenCalled();
  });
  it.each([
    { purchases: [] }, { purchases: 'invalid' }, { purchases: Array(11).fill(purchase) },
    { purchases: [purchase, null] }, { purchases: [purchase, { ...purchase, cost: 10.5 }] },
    { purchases: [purchase, { ...purchase, date: '2028-01-01' }] },
    { purchases: [purchase, { ...purchase, sourceAccountId: 'a2' }] },
    { purchases: [purchase, { ...purchase, goalId: 'orlando' }] },
    { purchases: [purchase, { ...purchase, goalId: 12 }] },
    { purchases: [{ ...purchase, cost: Number.MAX_SAFE_INTEGER }, purchase] },
  ])('checks every basket row and rejects unsupported combinations before reading accounts: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.picture).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('validates account ownership and matching goals for the shared basket source', async () => {
    const other = { ...purchase, label: 'Desk' };
    expect((await POST(request({ purchases: [purchase, other].map((item) => ({ ...item, sourceAccountId: 'foreign-account' })) }))).status).toBe(400);
    expect((await POST(request({ purchases: [purchase, other].map((item) => ({ ...item, sourceAccountId: 'a2', goalId: 'foreign-goal' })) }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('limits new runs while allowing reuse of an existing comparison', async () => {
    mocks.reserve.mockReturnValue(false);
    expect((await POST(request(purchase))).status).toBe(429);
    expect(mocks.run).not.toHaveBeenCalled();
    mocks.cached.mockReturnValue(true);
    const reused = await POST(request(purchase));
    expect(reused.status).toBe(200);
    await reused.text();
    expect(mocks.run).toHaveBeenCalledOnce();
  });
});
