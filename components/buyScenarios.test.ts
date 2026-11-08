import { describe, expect, it } from 'vitest';
import { buildBuyScenarios } from './buyScenarios';
import { alex, ASOF } from '../lib/engine/__tests__/fixtures';
import { daysBetween } from '../lib/engine/dates';
import { scoreHealth } from '../lib/engine/health';
import type { FinancialPicture } from '../lib/types';

const picture: FinancialPicture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const question = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };

describe('purchase scenario comparison', () => {
  it('models buying now and buying after the same account’s payday separately', () => {
    const [now, payday, skip] = buildBuyScenarios(picture, question, ASOF);
    expect(now.question).toEqual(question);
    expect(now.points[0].balance).toBe(-10000);
    expect(payday.question).toEqual({ ...question, date: '2026-11-13' });
    expect(payday.points[0].balance).toBe(80000);
    expect(payday.result?.verdict).toBe('yes');
    expect(now.lowest?.balance).toBeLessThan(0);
    expect(payday.points.at(-1)?.date).toBe('2026-12-13');
    expect(now.baseline).toBeNull();
    expect(payday.baseline).toBeNull();
    expect(skip).toMatchObject({ id: 'skip', title: "Don't buy it", question: null, result: null, unavailable: null });
    expect(skip.points[0].balance).toBe(80000);
  });

  it('keeps future purchase dates and finds the following payday', () => {
    const [planned, payday] = buildBuyScenarios(picture, { ...question, date: '2026-11-21' }, ASOF);
    expect(planned.title).toBe('Buy as planned');
    expect(planned.question?.date).toBe('2026-11-21');
    expect(payday.question?.date).toBe('2026-11-27');
  });

  it('models every purchase together on its own date and delays only purchases before payday', () => {
    // The first row is later than the second: payday is based on the earliest purchase.
    const purchases = [{ ...question, label: 'Desk', cost: 45000, date: '2026-11-21' }, { ...question, cost: 30000 }];
    const saved = JSON.stringify({ picture, purchases });
    const [planned, payday, skip] = buildBuyScenarios(picture, purchases, ASOF);
    expect(planned).toMatchObject({ title: 'Buy all as planned', purchases, totalCost: 75000, question: purchases[0] });
    expect(planned.points[0].balance).toBe(50000);
    expect(payday.purchases.map((item) => item.date)).toEqual(['2026-11-21', '2026-11-13']);
    expect(payday.points[0].balance).toBe(80000);
    expect(payday.totalCost).toBe(75000);
    expect(skip).toMatchObject({ title: "Don't buy any", question: null, purchases: [], totalCost: 0 });
    const beforeSecond = '2026-11-20', afterSecond = '2026-11-21';
    expect(skip.points.find((p) => p.date === beforeSecond)!.balance - planned.points.find((p) => p.date === beforeSecond)!.balance).toBe(30000);
    expect(skip.points.find((p) => p.date === afterSecond)!.balance - planned.points.find((p) => p.date === afterSecond)!.balance).toBe(75000);
    expect(skip.points.at(-1)?.date).toBe('2026-12-21');
    expect(JSON.stringify({ picture, purchases })).toBe(saved);
  });

  it('keeps single-purchase callers equivalent to a one-row basket', () => {
    expect(buildBuyScenarios(picture, question, ASOF)).toEqual(buildBuyScenarios(picture, [question], ASOF));
  });

  it('does not show a different account baseline for a mixed-source basket', () => {
    const scenarios = buildBuyScenarios(picture, [question, { ...question, sourceAccountId: 'a2', goalId: 'orlando' }], ASOF);
    expect(scenarios[0].points).toEqual([]);
    expect(scenarios[2].points).toEqual([]);
  });

  it('keeps calendar monthly pay anchored to its original day', () => {
    const monthly = { ...picture, paycheck: { ...picture.paycheck!, nextDate: '2027-01-31', cadenceDays: 30 } };
    const [, payday] = buildBuyScenarios(monthly, { ...question, date: '2027-02-28' }, ASOF);
    expect(payday.question?.date).toBe('2027-03-31');
  });

  it('handles semi-monthly pay without assuming every month has 30 days', () => {
    const semi = { ...picture, paycheck: { ...picture.paycheck!, nextDate: '2027-02-15', cadenceDays: 15, semiMonthlyDays: [15, 31] as [number, number] } };
    const [, payday] = buildBuyScenarios(semi, { ...question, date: '2027-02-28' }, ASOF);
    expect(payday.question?.date).toBe('2027-03-15');
  });

  it('does not use a paycheck deposited into another account', () => {
    const [, payday] = buildBuyScenarios(picture, { ...question, sourceAccountId: 'a2', goalId: 'orlando', cost: 18000 }, ASOF);
    expect(payday.question).toBeNull();
    expect(payday.points).toEqual([]);
  });

  it('does not invent a later payday when income is missing or beyond the supported horizon', () => {
    expect(buildBuyScenarios({ ...picture, paycheck: null }, question, ASOF)[1].question).toBeNull();
    expect(buildBuyScenarios(picture, { ...question, date: '2028-01-01' }, ASOF)[1].question).toBeNull();
  });

  it('compares not buying with the unchanged engine forecast through the latest purchase horizon', () => {
    const [, payday, skip] = buildBuyScenarios(picture, question, ASOF);
    const end = payday.points.at(-1)!.date;
    const expected = scoreHealth(picture, { asOf: ASOF, days: daysBetween(ASOF, end) });
    expect(skip.points).toEqual(expected.accountForecasts.a1);
    expect(skip.baseline?.score).toBe(expected.score);
    expect(skip.baseline?.overall).toBe(expected.overall);
    expect(skip.lowest).toEqual(skip.points.reduce((low, point) => point.balance < low.balance ? point : low));
    expect(skip.points.at(-1)?.date).toBe(end);
  });

  it('keeps future obligations and existing reservations in the no-purchase forecast', () => {
    const committed: FinancialPicture = { ...picture, reservations: [{ id: 'reserved', sourceAccountId: 'a1', amount: 10000, date: ASOF }] };
    const [, payday, skip] = buildBuyScenarios(committed, { ...question, date: '2026-11-21' }, ASOF);
    const expected = scoreHealth(committed, { asOf: ASOF, days: daysBetween(ASOF, payday.points.at(-1)!.date) });
    expect(skip.points).toEqual(expected.accountForecasts.a1);
    expect(skip.points[0].balance).toBe(70000);
    expect(skip.points.find((point) => point.date === '2026-11-10')?.balance).toBe(58000);
  });

  it('keeps the selected savings account and its goal allocation unchanged when not buying', () => {
    const saved = JSON.stringify(picture);
    const goalQuestion = { ...question, sourceAccountId: 'a2', goalId: 'orlando', cost: 18000 };
    const skip = buildBuyScenarios(picture, goalQuestion, ASOF)[2];
    const expected = scoreHealth(picture, { asOf: ASOF });
    expect(skip.points).toEqual(expected.accountForecasts.a2);
    expect(skip.points[0].balance).toBe(90000);
    expect(skip.baseline?.indicators).toEqual(expected.indicators);
    expect(JSON.stringify(picture)).toBe(saved);
  });

  it('still shows the real no-purchase baseline when the financial outlook is red', () => {
    const strained: FinancialPicture = { ...picture, accounts: picture.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 0 } : a) };
    const skip = buildBuyScenarios(strained, question, ASOF)[2];
    expect(skip.baseline?.overall).toBe('red');
    expect(skip.points.length).toBeGreaterThan(1);
    expect(skip.lowest?.balance).toBeLessThan(0);
    expect(skip.unavailable).toBeNull();
  });

  it('does not show forecast values when financial inputs are missing', () => {
    const scenarios = buildBuyScenarios({ ...picture, paycheck: null }, question, ASOF);
    expect(scenarios[0].result?.scoreAfter).toBeNull();
    for (const scenario of scenarios) {
      expect(scenario.points).toEqual([]);
      expect(scenario.lowest).toBeNull();
    }
  });

  it.each(['unknown', 'a3'])('does not substitute another account for an invalid source: %s', (sourceAccountId) => {
    const scenarios = buildBuyScenarios(picture, { ...question, sourceAccountId }, ASOF);
    expect(scenarios[0].points).toEqual([]);
    expect(scenarios[2].points).toEqual([]);
    expect(scenarios[2].lowest).toBeNull();
  });

  it('does not forecast a source account owned by another member', () => {
    const unowned: FinancialPicture = { ...picture, accounts: picture.accounts.map((a) => a.id === 'a1' ? { ...a, ownerMemberId: 'someone-else' } : a) };
    expect(buildBuyScenarios(unowned, question, ASOF)[2].points).toEqual([]);
  });
});
