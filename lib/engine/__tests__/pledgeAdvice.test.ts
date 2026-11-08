import { describe, expect, it } from 'vitest';
import type { FinancialPicture } from '../../types';
import { pledgeAdvice } from '../pledgeAdvice';
import { checkPledge } from '../split';
import { alex, ASOF } from './fixtures';

const TARGET = '2026-12-19'; // six weeks out

const green: FinancialPicture = {
  ...alex,
  goals: [],
  accounts: alex.accounts.map((a) => (a.id === 'a1' ? { ...a, balance: 500000 } : a.id === 'a2' ? { ...a, balance: 2000000 } : a)),
  txns: [
    { id: 't1', accountId: 'a1', kind: 'purchase', amount: 60000, date: '2026-11-01', description: 'Olive Garden', merchant: 'Olive Garden', category: 'Dining' },
    { id: 't2', accountId: 'a1', kind: 'purchase', amount: 9000, date: '2026-11-02', description: 'Kroger', merchant: 'Kroger', category: 'Groceries' },
    { id: 't3', accountId: 'a1', kind: 'purchase', amount: 4000, date: '2026-11-03', description: 'Planet Fitness', merchant: 'Planet Fitness', category: 'Entertainment' },
  ],
};
const big = { amount: 480000, sourceAccountId: 'a1' };

describe('pledgeAdvice', () => {
  it('finds an amount that really passes, below the one that failed', () => {
    const a = pledgeAdvice(green, big, TARGET, ASOF)!;
    expect(checkPledge(green, big, TARGET, ASOF).safe).toBe(false);
    expect(a.safeToday).toBeGreaterThan(0);
    expect(a.safeToday).toBeLessThan(big.amount);
    expect(checkPledge(green, { ...big, amount: a.safeToday }, TARGET, ASOF).safe).toBe(true);
  });

  it('splits the gap across the weeks and paychecks before the pay-by date', () => {
    const a = pledgeAdvice(green, big, TARGET, ASOF)!;
    expect(a.gap).toBe(big.amount - a.safeToday);
    expect(a.weeksLeft).toBe(6);
    expect(a.weeklyToSave).toBe(Math.ceil(a.gap / 6 / 100) * 100);
    expect(a.nextPayday).toBe('2026-11-13');
    expect(a.paychecksLeft).toBe(3); // Nov 13, Nov 27, Dec 11
    expect(a.perPaycheck).toBe(Math.ceil(a.gap / 3 / 100) * 100);
  });

  it('suggests non-essential cuts only, without counting a subscription twice', () => {
    const labels = pledgeAdvice(green, big, TARGET, ASOF)!.cuts.map((c) => c.label);
    expect(labels).toContain('Cut dining in half');
    expect(labels.join()).not.toMatch(/Rent|Car loan|groceries/i);
    expect(labels.filter((l) => /entertainment/i.test(l))).toEqual([]); // Planet Fitness is the subscription
  });

  it('says so when the person is not green yet, so no amount can pass', () => {
    const a = pledgeAdvice(alex, { amount: 30000, sourceAccountId: 'a1' }, TARGET, ASOF)!;
    expect(a.notGreenNow).toBe(true);
    expect(a.safeToday).toBe(0);
  });

  it('gives no advice for an account the person does not own', () => {
    expect(pledgeAdvice(green, { amount: 1000, sourceAccountId: 'nope' }, TARGET, ASOF)).toBeNull();
  });

  it('gives no advice when the pledge passed', () => {
    expect(pledgeAdvice(green, { amount: 10000, sourceAccountId: 'a1' }, TARGET, ASOF)).toBeNull();
  });
});
