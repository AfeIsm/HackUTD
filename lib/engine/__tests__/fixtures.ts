// Shared test data: Alex on Sat Nov 7, 2026 (same numbers as the mockup and PLAN seed).
import type { FinancialPicture, Obligation } from '../../types';

export const ASOF = '2026-11-07';

const ob = (key: string, name: string, amount: number, nextDate: string, essential: boolean, origin: Obligation['origin']): Obligation => ({
  key, accountId: 'a1', name, amount: Math.round(amount * 100), nextDate, cadence: 'monthly', essential, origin,
});

export const alex: FinancialPicture = {
  memberId: 'alex', reservations: [], missingInputs: [],
  accounts: [
    { id: 'a1', ownerMemberId: 'alex', type: 'Checking', nickname: 'Checking', balance: 38640 },
    { id: 'a2', ownerMemberId: 'alex', type: 'Savings', nickname: 'Savings', balance: 90000 },
    { id: 'a3', ownerMemberId: 'alex', type: 'Credit Card', nickname: 'Card', balance: 90000, minimumPayment: 2700, limit: 200000 },
  ],
  txns: [],
  paycheck: { accountId: 'a1', avgAmount: 185000, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [{ id: 'orlando', accountId: 'a2', name: 'Orlando fund', amount: 30000 }],
  obligations: [
    ob('bill:b2', 'Electric', 120, '2026-11-10', true, 'bill'),
    ob('bill:b3', 'Car insurance', 95, '2026-11-12', true, 'bill'),
    ob('bill:b4', 'T-Mobile USA', 65, '2026-11-12', true, 'bill'),
    ob('detected:netflix', 'Netflix', 15.49, '2026-11-14', false, 'detected'),
    ob('detected:spotify', 'Spotify', 11.99, '2026-11-16', false, 'detected'),
    ob('loan:l1', 'Car loan', 310, '2026-11-20', true, 'loan'),
    ob('detected:hulu', 'Hulu', 17.99, '2026-11-21', false, 'detected'),
    ob('detected:planet-fitness', 'Planet Fitness', 40, '2026-11-28', false, 'detected'),
    ob('card:a3', 'Card minimum', 27, '2026-11-23', true, 'cardMinimum'),
    ob('bill:b1', 'Rent', 1200, '2026-12-01', true, 'bill'),
  ],
};

// Keeps the 10-day bills target near $200, so purchase-logic tests aren't about the target itself.
export const lowEssentials = (p: FinancialPicture): FinancialPicture => ({ ...p, obligations: p.obligations.map((o) => o.name === 'Rent' ? { ...o, essential: false } : o) });
