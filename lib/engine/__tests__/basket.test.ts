import { describe, expect, it } from 'vitest';
import type { FinancialPicture } from '../../types';
import { canAfford, type AffordQuestion } from '../afford';
import { canAffordPurchases, MAX_PURCHASES, purchaseTotal } from '../basket';
import { addDays, daysBetween } from '../dates';
import { scoreHealth } from '../health';
import { ASOF, alex } from './fixtures';

const healthy: FinancialPicture = { ...alex, accounts: alex.accounts.map((account) => account.id === 'a1' ? { ...account, balance: 80_000 } : account) };
const item = (cost = 10_000, date = ASOF, sourceAccountId = 'a1'): AffordQuestion => ({ label: 'Purchase', cost, date, sourceAccountId });

describe('purchaseTotal', () => {
  it('sums exact cents, including an empty basket and the largest supported total', () => {
    expect(purchaseTotal([])).toBe(0);
    expect(purchaseTotal([{ cost: 101 }, { cost: 202 }])).toBe(303);
    expect(purchaseTotal([{ cost: Number.MAX_SAFE_INTEGER - 1 }, { cost: 1 }])).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each([0, -1, 10.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid purchase cents %s', (cost) => {
    expect(purchaseTotal([{ cost: 100 }, { cost }])).toBeNull();
  });
  it('rejects overflow across individually valid amounts', () => {
    expect(purchaseTotal([{ cost: Number.MAX_SAFE_INTEGER }, { cost: 1 }])).toBeNull();
  });
});

describe('canAffordPurchases', () => {
  it('preserves all single-purchase behavior', () => {
    for (const question of [item(), item(90_000), item(-1), item(100, 'invalid'), { ...item(18_000, ASOF, 'a2'), goalId: 'orlando' }]) {
      expect(canAffordPurchases(healthy, [question], ASOF)).toEqual(canAfford(healthy, question, ASOF));
    }
  });
  it('finds a joint shortfall even when either purchase alone is affordable', () => {
    const purchases = [item(30_000), { ...item(30_000), label: 'Second purchase' }];
    expect(purchases.every((purchase) => canAfford(healthy, purchase, ASOF).verdict === 'yes')).toBe(true);
    const result = canAffordPurchases(healthy, purchases, ASOF);
    expect(result.verdict).not.toBe('yes');
    expect(result.liquid).toBe(false);
    expect(result.after.overall).toBe('red');
  });
  it('applies every purchase on its date and simulates 30 days after the latest one', () => {
    const secondDate = '2026-11-20';
    const result = canAffordPurchases(healthy, [item(10_000), item(20_000, secondDate)], ASOF);
    const days = daysBetween(ASOF, secondDate) + 30;
    const baseline = scoreHealth(healthy, { asOf: ASOF, days });
    for (const date of [ASOF, '2026-11-19', secondDate, addDays(secondDate, 30)]) {
      const before = baseline.accountForecasts.a1.find((point) => point.date === date)!;
      const after = result.after.accountForecasts.a1.find((point) => point.date === date)!;
      expect(after.balance).toBe(before.balance - (date < secondDate ? 10_000 : 30_000));
    }
    expect(result.after.forecast.at(-1)?.date).toBe(addDays(secondDate, 30));
  });
  it('defaults omitted dates to today', () => {
    const result = canAffordPurchases(healthy, [{ ...item(), date: undefined }, item()], ASOF);
    expect(result.after.accountForecasts.a1[0].balance).toBe(60_000);
  });
  it('accepts the 335-day boundary and includes the following month', () => {
    const date = addDays(ASOF, 335);
    const result = canAffordPurchases(healthy, [item(1), item(1, date)], ASOF);
    expect(result.missingInputs).toEqual([]);
    expect(result.after.forecast.at(-1)?.date).toBe(addDays(ASOF, 365));
  });
  it.each(['2026-11-06', '2026-02-30', 'invalid', addDays(ASOF, 336)])('rejects a bad date on any item: %s', (date) => {
    const result = canAffordPurchases(healthy, [item(), item(1, date)], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('valid purchase date');
  });
  it('requires one to ten purchases', () => {
    for (const purchases of [[], Array.from({ length: MAX_PURCHASES + 1 }, () => item(1))]) {
      const result = canAffordPurchases(healthy, purchases, ASOF);
      expect(result.verdict).toBe('no');
      expect(result.missingInputs.join(' ')).toContain(`1 and ${MAX_PURCHASES}`);
    }
    expect(canAffordPurchases(healthy, Array.from({ length: MAX_PURCHASES }, () => item(1)), ASOF).missingInputs).toEqual([]);
  });
  it('rejects an overflowed total before simulating purchases', () => {
    const result = canAffordPurchases(healthy, [item(Number.MAX_SAFE_INTEGER), item(1)], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('supported calculation range');
    expect(result.after).toEqual(result.before);
  });
  it.each([0, -1, 1.5, NaN])('rejects an invalid amount on any row: %s', (cost) => {
    const result = canAffordPurchases(healthy, [item(), item(cost)], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.length).toBeGreaterThan(0);
    expect(result.liquid).toBe(false);
  });
  it('requires a shared exact source and shared goal', () => {
    const mixedSource = canAffordPurchases(healthy, [item(), item(100, ASOF, 'a2')], ASOF);
    const mixedGoal = canAffordPurchases(healthy, [{ ...item(100, ASOF, 'a2'), goalId: 'orlando' }, item(100, ASOF, 'a2')], ASOF);
    for (const result of [mixedSource, mixedGoal]) {
      expect(result.verdict).toBe('no');
      expect(result.missingInputs.join(' ')).toContain('same source account and savings goal');
    }
  });
  it.each(['unknown', 'a3'])('rejects an invalid source %s', (sourceAccountId) => {
    expect(canAffordPurchases(healthy, [item(1, ASOF, sourceAccountId), item(1, ASOF, sourceAccountId)], ASOF).missingInputs.join(' ')).toContain('owned checking or savings');
  });
  it('rejects an account belonging to someone else', () => {
    const picture = { ...healthy, accounts: [...healthy.accounts, { ...healthy.accounts[0], id: 'other', ownerMemberId: 'other' }] };
    const result = canAffordPurchases(picture, [item(1, ASOF, 'other'), item(1, ASOF, 'other')], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('owned checking or savings');
  });
  it('protects another savings goal from cumulative purchases', () => {
    const picture = { ...healthy, goals: [...healthy.goals, { id: 'protected', accountId: 'a2', name: 'Keep', amount: 40_000 }] };
    const purchase = { ...item(30_000, ASOF, 'a2'), goalId: 'orlando' };
    expect(canAfford(picture, purchase, ASOF).missingInputs).toEqual([]);
    const result = canAffordPurchases(picture, [purchase, purchase], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('protected for another savings goal');
  });
  it('protects other goals when a reservation already uses the selected goal', () => {
    const picture = { ...healthy, obligations: [],
      goals: [...healthy.goals, { id: 'protected', accountId: 'a2', name: 'Keep', amount: 40_000 }],
      reservations: [{ id: 'committed', sourceAccountId: 'a2', goalId: 'orlando', amount: 10_000, date: ASOF }] };
    const purchase = { ...item(25_000, ASOF, 'a2'), goalId: 'orlando' };
    const snapshot = structuredClone(picture);
    const result = canAffordPurchases(picture, [purchase, purchase], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('protected for another savings goal');
    expect(picture).toEqual(snapshot);
  });
  it('counts a reservation covered by another goal once without blocking the remaining spendable cash', () => {
    const picture = { ...healthy, obligations: [],
      goals: [...healthy.goals, { id: 'protected', accountId: 'a2', name: 'Keep', amount: 40_000 }],
      reservations: [{ id: 'committed', sourceAccountId: 'a2', goalId: 'protected', amount: 10_000, date: ASOF }] };
    const purchase = { ...item(25_000, ASOF, 'a2'), goalId: 'orlando' };
    const result = canAffordPurchases(picture, [purchase, purchase], ASOF);
    expect(result.missingInputs).toEqual([]);
    expect(result.verdict).toBe('yes');
    // $300 remains allocated to the protected goal after its $100 commitment is paid.
    expect(result.after.accountForecasts.a2[0].balance).toBe(30_000);
  });
  it('protects other goals after several reservations exhaust the selected goal', () => {
    const picture = { ...healthy, obligations: [],
      goals: [...healthy.goals, { id: 'protected', accountId: 'a2', name: 'Keep', amount: 40_000 }],
      reservations: [
        { id: 'one', sourceAccountId: 'a2', goalId: 'orlando', amount: 20_000, date: ASOF },
        { id: 'two', sourceAccountId: 'a2', goalId: 'orlando', amount: 20_000, date: ASOF },
      ] };
    const purchase = { ...item(6_000, ASOF, 'a2'), goalId: 'orlando' };
    const result = canAffordPurchases(picture, [purchase, purchase], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.missingInputs.join(' ')).toContain('protected for another savings goal');
    expect(canAffordPurchases(picture, [{ ...purchase, cost: 5_000 }, { ...purchase, cost: 5_000 }], ASOF).missingInputs).toEqual([]);
  });
  it('does not borrow liquidity from another owned account', () => {
    const picture = { ...healthy, accounts: [...healthy.accounts, { ...healthy.accounts[0], id: 'rich', balance: 10_000_000 }] };
    const result = canAffordPurchases(picture, [item(50_000), item(50_000)], ASOF);
    expect(result.liquid).toBe(false);
    expect(result.after.accountForecasts.a1[0].balance).toBe(-20_000);
    expect(result.after.accountForecasts.rich[0].balance).toBe(10_000_000);
  });
  it('reserves existing commitments before funding all purchases due today', () => {
    const picture = { ...healthy, reservations: [{ id: 'committed', sourceAccountId: 'a1', amount: 70_000, date: '2027-02-01' }] };
    const result = canAffordPurchases(picture, [item(6_000), item(6_000)], ASOF);
    expect(result.after.accountForecasts.a1[0].balance).toBe(68_000);
    expect(result.liquid).toBe(false);
  });
  it('cannot fund today’s joint purchases using an upcoming paycheck', () => {
    const picture = { ...healthy, accounts: healthy.accounts.map((account) => account.id === 'a1' ? { ...account, balance: 10_000 } : account) };
    const result = canAffordPurchases(picture, [item(6_000), item(6_000)], ASOF);
    expect(result.after.accountForecasts.a1[0].balance).toBe(-2_000);
    expect(result.liquid).toBe(false);
  });
  it('checks today’s combined spend against current cash even when a deposit masks it in the daily forecast', () => {
    const picture = { ...healthy, accounts: healthy.accounts.map((account) => account.id === 'a1' ? { ...account, balance: 10_000 } : account),
      paycheck: { ...healthy.paycheck!, nextDate: ASOF } };
    const purchases = [item(6_000), item(6_000)];
    expect(purchases.every((purchase) => canAfford(picture, purchase, ASOF).verdict === 'yes')).toBe(true);
    const result = canAffordPurchases(picture, purchases, ASOF);
    expect(result.after.accountForecasts.a1[0].balance).toBe(183_000);
    expect(result.liquid).toBe(false);
    expect(result.verdict).toBe('no');
  });
  it('accounts for multiple purchases consuming one goal without reusing its allocation', () => {
    const purchase = { ...item(20_000, ASOF, 'a2'), goalId: 'orlando' };
    const result = canAffordPurchases(healthy, [purchase, purchase], ASOF);
    expect(result.after.accountForecasts.a2[0].balance).toBe(50_000);
    expect(result.after.indicators.find((indicator) => indicator.key === 'savingsProtection')?.value).toBe(10_000);
    expect(result.flags.join(' ')).toContain('emergency savings');
  });
  it('verifies the whole wait alternative and leaves later purchase dates intact', () => {
    const result = canAffordPurchases(healthy, [item(45_000, '2026-11-20'), { ...item(45_000), date: undefined }], ASOF);
    expect(result.verdict).toBe('yesIf');
    expect(result.readyDate).toBe('2026-11-13');
    const alternative = result.verifiedAlternative!.result;
    expect(alternative.overall).toBe('green');
    const baseline = scoreHealth(healthy, { asOf: ASOF, days: daysBetween(ASOF, '2026-11-20') + 30 });
    for (const date of ['2026-11-13', '2026-11-20']) {
      const expected = baseline.accountForecasts.a1.find((point) => point.date === date)!.balance - (date === '2026-11-13' ? 45_000 : 90_000);
      expect(alternative.accountForecasts.a1.find((point) => point.date === date)?.balance).toBe(expected);
    }
  });
  it('does not offer an unverified alternative', () => {
    const result = canAffordPurchases(healthy, [item(2_000_000), item(2_000_000)], ASOF);
    expect(result.verdict).toBe('no');
    expect(result.verifiedAlternative).toBeUndefined();
  });
  it('preserves bills and reservations exactly once and never mutates inputs', () => {
    const picture = structuredClone({ ...healthy, reservations: [{ id: 'committed', sourceAccountId: 'a1', amount: 5_000, date: '2026-11-21' }] });
    const purchases = [item(), item(10_000, '2026-11-20')];
    const snapshot = structuredClone({ picture, purchases });
    const result = canAffordPurchases(picture, purchases, ASOF);
    const baseline = scoreHealth(picture, { asOf: ASOF, days: daysBetween(ASOF, '2026-11-20') + 30 });
    expect(result.after.accountForecasts.a1.at(-1)!.balance).toBe(baseline.accountForecasts.a1.at(-1)!.balance - 20_000);
    expect({ picture, purchases }).toEqual(snapshot);
  });
});
