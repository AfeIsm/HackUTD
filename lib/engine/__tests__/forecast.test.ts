import { describe, expect, it } from 'vitest';
import type { FinancialPicture, Obligation } from '../../types';
import { forecastBalance } from '../forecast';

const ob = (key: string, name: string, amount: number, nextDate: string, essential: boolean): Obligation => ({
  key, name, amount, nextDate, cadence: 'monthly', essential, origin: essential ? 'bill' : 'detected',
});

// Alex on Sat Nov 7, 2026 (same numbers as the mockup)
const alex: FinancialPicture = {
  memberId: 'alex',
  accounts: [
    { id: 'a1', type: 'Checking', nickname: 'Checking', balance: 386.4 },
    { id: 'a2', type: 'Savings', nickname: 'Savings', balance: 900 },
    { id: 'a3', type: 'Credit Card', nickname: 'Card', balance: 900, limit: 2000 },
  ],
  txns: [],
  paycheck: { avgAmount: 1850, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [{ id: 'g1', name: 'Orlando fund', amount: 300 }],
  obligations: [
    ob('bill:b2', 'Electric', 120, '2026-11-10', true),
    ob('bill:b3', 'Car insurance', 95, '2026-11-12', true),
    ob('bill:b4', 'T-Mobile USA', 65, '2026-11-12', true),
    ob('detected:netflix', 'Netflix', 15.49, '2026-11-14', false),
    ob('detected:spotify', 'Spotify', 11.99, '2026-11-16', false),
    ob('loan:l1', 'Car loan', 310, '2026-11-20', true),
    ob('detected:hulu', 'Hulu', 17.99, '2026-11-21', false),
    ob('detected:planet-fitness', 'Planet Fitness', 40, '2026-11-28', false),
    ob('bill:b1', 'Rent', 1200, '2026-12-01', true),
  ],
};
const asOf = '2026-11-07';
const at = (pts: { date: string; balance: number }[], date: string) => pts.find((p) => p.date === date)?.balance;

describe('forecastBalance', () => {
  const all = forecastBalance(alex, { asOf });
  const essential = forecastBalance(alex, { asOf, essentialOnly: true });

  it('has one point per day for 30 days', () => {
    expect(all.checking).toHaveLength(31);
    expect(all.checking[0]).toEqual({ date: '2026-11-07', balance: 386.4 });
    expect(all.checking[30].date).toBe('2026-12-07');
  });

  it('finds the lowest point: $106.40 on Nov 12, the day before payday', () => {
    expect(essential.lowest).toEqual({ date: '2026-11-12', balance: 106.4 });
  });

  it('adds the paycheck on payday', () => {
    expect(at(all.checking, '2026-11-13')).toBe(1956.4);
  });

  it('counts subscriptions only when not essentialOnly', () => {
    expect(at(all.checking, '2026-12-07')).toBe(2210.93);
    expect(at(essential.checking, '2026-12-07')).toBe(2296.4);
  });

  it('a $900 purchase today sends checking to -$793.60 on Nov 12', () => {
    const f = forecastBalance(alex, { asOf, essentialOnly: true, changes: [{ kind: 'oneTime', amount: 900, label: 'PS6' }] });
    expect(f.lowest).toEqual({ date: '2026-11-12', balance: -793.6 });
  });

  it('a purchase from savings lowers savings, not checking', () => {
    const f = forecastBalance(alex, { asOf, changes: [{ kind: 'oneTime', amount: 180, source: 'savings', label: 'Best Buy' }] });
    expect(at(f.savings, '2026-12-07')).toBe(720);
    expect(f.checking).toEqual(all.checking);
  });

  it('weekly saving into a goal moves money from checking to savings', () => {
    const f = forecastBalance(alex, { asOf, changes: [{ kind: 'weekly', amount: 45, goalId: 'ps6', label: 'PS6 fund' }] });
    // Nov 14, 21, 28, Dec 5 → 4 × $45
    expect(at(f.savings, '2026-12-07')).toBe(1080);
    expect(at(f.checking, '2026-12-07')).toBe(round2(2210.93 - 180));
    expect(f.lowest.balance).toBe(106.4); // first transfer is after the Nov 12 low
  });

  it('cancelling a subscription keeps that money', () => {
    const f = forecastBalance(alex, { asOf, changes: [{ kind: 'cancelObligation', amount: 0, obligationKey: 'detected:hulu', label: 'Cancel Hulu' }] });
    expect(at(f.checking, '2026-12-07')).toBe(round2(2210.93 + 17.99));
  });

  it('rolls stale due dates forward', () => {
    const stale = { ...alex, obligations: [ob('bill:x', 'Old bill', 50, '2026-09-10', true)], paycheck: null };
    const f = forecastBalance(stale, { asOf });
    expect(at(f.checking, '2026-11-10')).toBe(336.4); // Sep 10 → Oct 10 → Nov 10
  });

  it('is deterministic', () => {
    expect(forecastBalance(alex, { asOf })).toEqual(all);
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
