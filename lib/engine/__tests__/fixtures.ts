// Shared test data: Alex on Sat Nov 7, 2026 (same numbers as the mockup and PLAN seed).
import type { FinancialPicture, Obligation } from '../../types';

export const ASOF = '2026-11-07';

const ob = (key: string, name: string, amount: number, nextDate: string, essential: boolean, origin: Obligation['origin']): Obligation => ({
  key, name, amount, nextDate, cadence: 'monthly', essential, origin,
});

export const alex: FinancialPicture = {
  memberId: 'alex',
  accounts: [
    { id: 'a1', type: 'Checking', nickname: 'Checking', balance: 386.4 },
    { id: 'a2', type: 'Savings', nickname: 'Savings', balance: 900 },
    { id: 'a3', type: 'Credit Card', nickname: 'Card', balance: 900, limit: 2000 },
  ],
  txns: [],
  paycheck: { avgAmount: 1850, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [{ id: 'orlando', name: 'Orlando fund', amount: 300 }],
  obligations: [
    ob('bill:b2', 'Electric', 120, '2026-11-10', true, 'bill'),
    ob('bill:b3', 'Car insurance', 95, '2026-11-12', true, 'bill'),
    ob('bill:b4', 'T-Mobile USA', 65, '2026-11-12', true, 'bill'),
    ob('detected:netflix', 'Netflix', 15.49, '2026-11-14', false, 'detected'),
    ob('detected:spotify', 'Spotify', 11.99, '2026-11-16', false, 'detected'),
    ob('loan:l1', 'Car loan', 310, '2026-11-20', true, 'loan'),
    ob('detected:hulu', 'Hulu', 17.99, '2026-11-21', false, 'detected'),
    ob('detected:planet-fitness', 'Planet Fitness', 40, '2026-11-28', false, 'detected'),
    ob('bill:b1', 'Rent', 1200, '2026-12-01', true, 'bill'),
  ],
};
