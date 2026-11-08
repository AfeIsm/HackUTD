import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alex, ASOF } from '../../engine/__tests__/fixtures';
import type { ComparisonEvent } from '../compare';
const mocks = vi.hoisted(() => ({ saved: vi.fn(), search: vi.fn(), recommend: vi.fn() }));
vi.mock('../buyOptions', () => ({
  savedBuyAnswer: mocks.saved, runBuyOptions: mocks.search,
}));
vi.mock('../comparisonAgent', () => ({ recommendComparison: mocks.recommend }));
import { comparisonCached, comparisonId, reserveComparisonRun, runComparison } from '../compare';
const purchase = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const recommendation = { id: 'payday', why: 'Waiting keeps your bills covered.', source: 'nemotron' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.recommend.mockResolvedValue(recommendation);
});
describe('comparison orchestration', () => {
  it('shares an in-progress run and replays the checked result when reopened', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.recommend.mockImplementationOnce(async () => { await gate; return recommendation; });
    const first: ComparisonEvent[] = [], second: ComparisonEvent[] = [], reopened: ComparisonEvent[] = [];
    const a = runComparison('single-flight', picture, purchase, (event) => first.push(event));
    const b = runComparison('single-flight', picture, purchase, (event) => second.push(event));
    release(); await Promise.all([a, b]);
    await runComparison('single-flight', picture, purchase, (event) => reopened.push(event));
    expect(mocks.recommend).toHaveBeenCalledOnce();
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    expect(reopened).toEqual(first);
    const scenarioEvents = first.filter((event) => event.type === 'scenarios');
    expect(scenarioEvents).toHaveLength(1);
    expect(scenarioEvents[0].scenarios.map((scenario) => scenario.id)).toEqual(['now', 'payday', 'skip']);
    expect(first.at(-1)).toMatchObject({ type: 'done', recommendation, searchMessage: null });
    expect(comparisonCached(comparisonId('single-flight', picture, purchase))).toBe(true);
  });
  it('does not reuse another member’s result or outdated account balances', async () => {
    await runComparison('member-A', picture, purchase, vi.fn());
    await runComparison('member-B', picture, purchase, vi.fn());
    const changed = { ...picture, accounts: picture.accounts.map((a, i) => i === 0 ? { ...a, balance: 90000 } : a) };
    await runComparison('member-A', changed, purchase, vi.fn());
    expect(mocks.recommend).toHaveBeenCalledTimes(3);
  });
  it('includes every item field and the complete financial profile in the basket key', () => {
    const second = { ...purchase, label: 'Desk', cost: 20000, date: '2026-11-21' };
    const id = comparisonId('basket-key', picture, [purchase, second]);
    for (const changed of [
      { ...second, label: 'Chair' }, { ...second, cost: 20001 }, { ...second, date: '2026-11-22' },
      { ...second, sourceAccountId: 'a2' }, { ...second, goalId: 'orlando' },
    ]) expect(comparisonId('basket-key', picture, [purchase, changed])).not.toBe(id);
    expect(comparisonId('basket-key', { ...picture, goals: [] }, [purchase, second])).not.toBe(id);
    expect(comparisonId('other-member', picture, [purchase, second])).not.toBe(id);
    expect(comparisonId('basket-key', picture, purchase)).toBe(comparisonId('basket-key', picture, [purchase]));
    expect(id.startsWith('purchase-basket-v1:')).toBe(true);
  });
  it('reuses an unchanged basket but reruns when the second purchase changes', async () => {
    const second = { ...purchase, label: 'Desk', cost: 20000, date: '2026-11-21' };
    await runComparison('basket-rerun', picture, [purchase, second], vi.fn());
    await runComparison('basket-rerun', picture, [purchase, second], vi.fn());
    await runComparison('basket-rerun', picture, [purchase, { ...second, cost: 25000 }], vi.fn());
    expect(mocks.recommend).toHaveBeenCalledTimes(2);
    const latest = mocks.recommend.mock.calls[1][0];
    expect(latest[0].totalCost).toBe(115000);
    expect(latest[0].purchases).toHaveLength(2);
  });
  it('allows another agent attempt after returning an engine fallback', async () => {
    mocks.recommend.mockResolvedValueOnce({ ...recommendation, source: 'engine' });
    const events: ComparisonEvent[] = [];
    await runComparison('fallback-retry', picture, purchase, (event) => events.push(event));
    expect(events.at(-1)).toMatchObject({ type: 'done', recommendation: { source: 'engine' }, searchMessage: null });
    expect(comparisonCached(comparisonId('fallback-retry', picture, purchase))).toBe(false);
    await runComparison('fallback-retry', picture, purchase, vi.fn());
    expect(mocks.recommend).toHaveBeenCalledTimes(2);
  });
  it('allows a retry after an incomplete comparison instead of caching the failure', async () => {
    mocks.recommend.mockRejectedValueOnce(new Error('Comparison unavailable'));
    const events: ComparisonEvent[] = [];
    await runComparison('failed-comparison', picture, purchase, (event) => events.push(event));
    expect(events.at(-1)).toMatchObject({ type: 'error', error: expect.any(String) });
    expect(comparisonCached(comparisonId('failed-comparison', picture, purchase))).toBe(false);
    await runComparison('failed-comparison', picture, purchase, vi.fn());
    expect(mocks.recommend).toHaveBeenCalledTimes(2);
  });
  it('caps new requests within the instance window', () => {
    expect(Array.from({ length: 8 }, () => reserveComparisonRun('rate-test'))).toEqual(Array(8).fill(true));
    expect(reserveComparisonRun('rate-test')).toBe(false);
  });
});
