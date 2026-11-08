// Demo people and their money, used by the UI until the Nessie seed + API routes are wired up.
// Numbers match PLAN.md §9 and the mockup. Backend's real data replaces this.

import type { FinancialPicture, Obligation } from '../types';

export const DEMO_ASOF = '2026-11-07'; // "today" for the demo, so results never drift

export type Role = 'self' | 'spouse' | 'dependent' | 'friend';

export interface Person {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  initial: string;
  color: string; // avatar color
  phone?: string;
  picture: FinancialPicture | null; // null = no accounts (e.g. a 10-year-old)
}

const ob = (
  key: string, name: string, amount: number, nextDate: string, essential: boolean, origin: Obligation['origin'],
): Obligation => ({ key, name, amount, nextDate, cadence: 'monthly', essential, origin });

const alex: FinancialPicture = {
  memberId: 'alex',
  accounts: [
    { id: 'alex-checking', type: 'Checking', nickname: 'Checking', balance: 386.4 },
    { id: 'alex-savings', type: 'Savings', nickname: 'Savings', balance: 900 },
    { id: 'alex-card', type: 'Credit Card', nickname: 'Credit card', balance: 900, limit: 2000 },
  ],
  txns: [],
  paycheck: { avgAmount: 1850, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [{ id: 'orlando', name: 'Orlando fund', amount: 300, huddleId: 'orlando' }],
  obligations: [
    ob('bill:alex-electric', 'Electric', 120, '2026-11-10', true, 'bill'),
    ob('bill:alex-insurance', 'Car insurance', 95, '2026-11-12', true, 'bill'),
    ob('bill:alex-phone', 'T-Mobile', 65, '2026-11-12', true, 'bill'),
    ob('detected:netflix', 'Netflix', 15.49, '2026-11-14', false, 'detected'),
    ob('detected:spotify', 'Spotify', 11.99, '2026-11-16', false, 'detected'),
    ob('loan:alex-car', 'Car loan', 310, '2026-11-20', true, 'loan'),
    ob('detected:hulu', 'Hulu', 17.99, '2026-11-21', false, 'detected'),
    ob('detected:planet-fitness', 'Planet Fitness', 40, '2026-11-28', false, 'detected'),
    ob('bill:alex-rent', 'Rent', 1200, '2026-12-01', true, 'bill'),
  ],
};

const jordan: FinancialPicture = {
  memberId: 'jordan',
  accounts: [
    { id: 'jordan-checking', type: 'Checking', nickname: 'Checking', balance: 2140 },
    { id: 'jordan-savings', type: 'Savings', nickname: 'Savings', balance: 2400 },
    { id: 'jordan-card', type: 'Credit Card', nickname: 'Credit card', balance: 310, limit: 5000 },
  ],
  txns: [],
  paycheck: { avgAmount: 2600, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [],
  obligations: [
    ob('bill:jordan-utilities', 'Utilities', 140, '2026-11-09', true, 'bill'),
    ob('detected:meal-kit', 'Meal kit', 240, '2026-11-10', false, 'detected'),
    ob('bill:jordan-phone', 'Verizon', 70, '2026-11-12', true, 'bill'),
    ob('loan:jordan-student', 'Student loan', 420, '2026-11-15', true, 'loan'),
    ob('detected:gym', 'Gym', 60, '2026-11-18', false, 'detected'),
    ob('detected:disney', 'Disney+', 13.99, '2026-11-19', false, 'detected'),
    ob('bill:jordan-insurance', 'Car insurance', 110, '2026-11-20', true, 'bill'),
    ob('detected:audible', 'Audible', 14.95, '2026-11-22', false, 'detected'),
    ob('bill:jordan-health', 'Health insurance', 380, '2026-11-25', true, 'bill'),
    ob('detected:youtube', 'YouTube Premium', 13.99, '2026-11-26', false, 'detected'),
  ],
};

const maya: FinancialPicture = {
  memberId: 'maya',
  accounts: [
    { id: 'maya-checking', type: 'Checking', nickname: 'Checking', balance: 120 },
    { id: 'maya-savings', type: 'Savings', nickname: 'Savings', balance: 400 },
  ],
  txns: [],
  paycheck: { avgAmount: 150, cadenceDays: 15, nextDate: '2026-11-15' },
  goals: [],
  obligations: [],
};

const sam: FinancialPicture = {
  memberId: 'sam',
  accounts: [
    { id: 'sam-checking', type: 'Checking', nickname: 'Checking', balance: 1480 },
    { id: 'sam-savings', type: 'Savings', nickname: 'Savings', balance: 3200 },
    { id: 'sam-card', type: 'Credit Card', nickname: 'Credit card', balance: 450, limit: 3000 },
  ],
  txns: [],
  paycheck: { avgAmount: 2200, cadenceDays: 14, nextDate: '2026-11-13' },
  goals: [],
  obligations: [
    ob('bill:sam-rent', 'Rent', 1100, '2026-12-01', true, 'bill'),
    ob('bill:sam-electric', 'Electric', 90, '2026-11-14', true, 'bill'),
    ob('bill:sam-phone', 'AT&T', 60, '2026-11-18', true, 'bill'),
    ob('detected:sam-spotify', 'Spotify', 11.99, '2026-11-20', false, 'detected'),
  ],
};

export const PEOPLE: Person[] = [
  { id: 'alex', name: 'Alex', role: 'self', roleLabel: 'Household owner', initial: 'A', color: '#1F4FD8', picture: alex },
  { id: 'jordan', name: 'Jordan', role: 'spouse', roleLabel: 'Spouse', initial: 'J', color: '#6B4FBB', picture: jordan },
  { id: 'maya', name: 'Maya', role: 'dependent', roleLabel: 'Dependent · 16', initial: 'M', color: '#0F766E', picture: maya },
  { id: 'leo', name: 'Leo', role: 'dependent', roleLabel: 'Dependent · 10', initial: 'L', color: '#B45309', picture: null },
  { id: 'sam', name: 'Sam', role: 'friend', roleLabel: 'Friend', initial: 'S', color: '#3D424C', phone: '555-0142', picture: sam },
];

export function getPerson(id: string): Person {
  return PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];
}

export const HOUSEHOLD_IDS = ['alex', 'jordan', 'maya', 'leo'];
