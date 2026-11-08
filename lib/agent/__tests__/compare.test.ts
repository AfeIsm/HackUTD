import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alex, ASOF } from '../../engine/__tests__/fixtures';
import type { FinancialPicture } from '../../types';
import type { BuyQuestion, BuyEvent } from '../buyOptions';
import type { ComparisonEvent } from '../compare';
const mocks = vi.hoisted(() => ({ saved: vi.fn(), search: vi.fn(), recommend: vi.fn() }));
vi.mock('../buyOptions', () => ({
  buyAnswerId: (member: string, p: FinancialPicture, q: BuyQuestion) => JSON.stringify([member, p.accounts[0].balance, q]),
  savedBuyAnswer: mocks.saved, runBuyOptions: mocks.search,
}));
vi.mock('../comparisonAgent', () => ({ recommendComparison: mocks.recommend }));
import { comparisonCached, reserveComparisonRun, runComparison } from '../compare';
const purchase = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const found = { proposals: [], noSolution: null, summary: null, usedDemo: false };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.saved.mockResolvedValue(null);
  mocks.search.mockImplementation(async (_member: string, _id: string, _p: FinancialPicture, _q: BuyQuestion, send: (event: BuyEvent) => void) => { send({ type: 'done', result: found }); });
  mocks.recommend.mockResolvedValue({ id: 'payday', why: 'Waiting keeps your bills covered.', source: 'nemotron' });
});
describe('comparison orchestration', () => {
  it('shares an in-progress run and replays the checked result when reopened', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.search.mockImplementationOnce(async (_member: string, _id: string, _p: FinancialPicture, _q: BuyQuestion, send: (event: BuyEvent) => void) => { await gate; send({ type: 'done', result: found }); });
    const first: ComparisonEvent[] = [], second: ComparisonEvent[] = [], reopened: ComparisonEvent[] = [];
    const a = runComparison('single-flight', picture, purchase, (event) => first.push(event));
    const b = runComparison('single-flight', picture, purchase, (event) => second.push(event));
    release(); await Promise.all([a, b]);
    await runComparison('single-flight', picture, purchase, (event) => reopened.push(event));
    expect(mocks.search).toHaveBeenCalledOnce();
    expect(mocks.recommend).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(reopened).toEqual(first);
    expect(first.at(-1)?.type).toBe('done');
  });
  it('does not reuse another member’s result or outdated account balances', async () => {
    await runComparison('member-A', picture, purchase, vi.fn());
    await runComparison('member-B', picture, purchase, vi.fn());
    const changed = { ...picture, accounts: picture.accounts.map((a, i) => i === 0 ? { ...a, balance: 90000 } : a) };
    await runComparison('member-A', changed, purchase, vi.fn());
    expect(mocks.recommend).toHaveBeenCalledTimes(3);
  });
  it('allows a retry after a live-search failure instead of caching the partial run', async () => {
    mocks.search.mockRejectedValue(new Error('Search unavailable'));
    const events: ComparisonEvent[] = [];
    await runComparison('failed-search', picture, purchase, (event) => events.push(event));
    expect(events.at(-1)).toMatchObject({ type: 'done', searchMessage: expect.any(String) });
    expect(comparisonCached(JSON.stringify(['failed-search', picture.accounts[0].balance, purchase]))).toBe(false);
  });
  it('caps new requests within the instance window', () => {
    expect(Array.from({ length: 8 }, () => reserveComparisonRun('rate-test'))).toEqual(Array(8).fill(true));
    expect(reserveComparisonRun('rate-test')).toBe(false);
  });
});
