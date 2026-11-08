import { describe, expect, it } from 'vitest';
import { buildBuyScenarios } from './buyScenarios';
import { alex, ASOF } from '../lib/engine/__tests__/fixtures';
import type { FinancialPicture } from '../lib/types';
import type { Proposal } from '../lib/purchase/types';

const picture: FinancialPicture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const question = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
const listing = (patch: Partial<Proposal> = {}): Proposal => ({
  id: 'offer-1', offerKey: 'retailer-console', kind: 'product', title: 'Lower-priced console', seller: 'Retailer',
  link: 'https://example.com/console', linkIsSearch: false, retrievedAt: '2026-11-08T12:00:00Z', demo: false,
  deliveryText: null, why: '', planTotal: 49999, total: 49999, lines: [{ label: 'Item', amount: 49999 }],
  basis: 'advertised', unknownCosts: [], tradeoffs: [], underBudgetBy: 0, belowListPriceBy: null, ...patch,
});

describe('purchase scenario comparison', () => {
  it('models buying now and buying after the same account’s payday separately', () => {
    const [now, payday] = buildBuyScenarios(picture, question, [], ASOF);
    expect(now.question).toEqual(question);
    expect(now.points[0].balance).toBe(-10000);
    expect(payday.question).toEqual({ ...question, date: '2026-11-13' });
    expect(payday.points[0].balance).toBe(80000);
    expect(payday.result?.verdict).toBe('yes');
    expect(now.lowest?.balance).toBeLessThan(0);
    expect(payday.points.at(-1)?.date).toBe('2026-12-13');
  });

  it('keeps future purchase dates and finds the following payday', () => {
    const [planned, payday] = buildBuyScenarios(picture, { ...question, date: '2026-11-21' }, [], ASOF);
    expect(planned.title).toBe('Buy as planned');
    expect(planned.question?.date).toBe('2026-11-21');
    expect(payday.question?.date).toBe('2026-11-27');
  });

  it('keeps calendar monthly pay anchored to its original day', () => {
    const monthly = { ...picture, paycheck: { ...picture.paycheck!, nextDate: '2027-01-31', cadenceDays: 30 } };
    const [, payday] = buildBuyScenarios(monthly, { ...question, date: '2027-02-28' }, [], ASOF);
    expect(payday.question?.date).toBe('2027-03-31');
  });

  it('handles semi-monthly pay without assuming every month has 30 days', () => {
    const semi = { ...picture, paycheck: { ...picture.paycheck!, nextDate: '2027-02-15', cadenceDays: 15, semiMonthlyDays: [15, 31] as [number, number] } };
    const [, payday] = buildBuyScenarios(semi, { ...question, date: '2027-02-28' }, [], ASOF);
    expect(payday.question?.date).toBe('2027-03-15');
  });

  it('does not use a paycheck deposited into another account', () => {
    const [, payday] = buildBuyScenarios(picture, { ...question, sourceAccountId: 'a2', goalId: 'orlando', cost: 18000 }, [], ASOF);
    expect(payday.question).toBeNull();
    expect(payday.points).toEqual([]);
  });

  it('does not invent a later payday when income is missing or beyond the supported horizon', () => {
    expect(buildBuyScenarios({ ...picture, paycheck: null }, question, [], ASOF)[1].question).toBeNull();
    expect(buildBuyScenarios(picture, { ...question, date: '2028-01-01' }, [], ASOF)[1].question).toBeNull();
  });

  it('re-scores a real lower price on the exact original account', () => {
    const cheaper = buildBuyScenarios(picture, question, [listing()], ASOF)[2];
    expect(cheaper.question).toEqual({ ...question, label: 'Lower-priced console', cost: 49999 });
    expect(cheaper.points[0].balance).toBe(30001);
    expect(cheaper.offer?.seller).toBe('Retailer');
  });

  it.each([
    { demo: true }, { kind: 'rental' as const }, { total: 90000 }, { total: 0 }, { total: 499.99 },
    { total: NaN }, { link: null }, { linkIsSearch: true }, { link: 'javascript:alert(1)' },
  ])('excludes an offer that is not a usable live lower-priced product: %j', (patch) => {
    expect(buildBuyScenarios(picture, question, [listing(patch)], ASOF)[2].question).toBeNull();
  });

  it('selects the lowest live quote without mutating or hiding its unknown costs', () => {
    const offers = [listing({ id: 'higher', total: 60000 }), listing({ id: 'lower', unknownCosts: ['Shipping', 'Tax'] })];
    const cheaper = buildBuyScenarios(picture, question, offers, ASOF)[2];
    expect(cheaper.offer?.id).toBe('lower');
    expect(cheaper.offer?.unknownCosts).toEqual(['Shipping', 'Tax']);
    expect(offers[0].id).toBe('higher');
  });

  it('keeps savings allocations tied to the original account and goal', () => {
    const saved = JSON.stringify(picture);
    const goalQuestion = { ...question, sourceAccountId: 'a2', goalId: 'orlando', cost: 18000 };
    const cheaper = buildBuyScenarios(picture, goalQuestion, [listing({ total: 15000 })], ASOF)[2];
    expect(cheaper.question?.goalId).toBe('orlando');
    expect(cheaper.result?.sourceAccountId).toBe('a2');
    expect(cheaper.points[0].balance).toBe(75000);
    expect(JSON.stringify(picture)).toBe(saved);
  });

  it('does not show baseline balances as a purchase forecast when inputs are missing', () => {
    const scenarios = buildBuyScenarios({ ...picture, paycheck: null }, question, [], ASOF);
    expect(scenarios[0].result?.scoreAfter).toBeNull();
    expect(scenarios[0].points).toEqual([]);
    expect(scenarios[0].lowest).toBeNull();
    expect(buildBuyScenarios(picture, { ...question, sourceAccountId: 'unknown' }, [], ASOF)[0].points).toEqual([]);
  });
});
