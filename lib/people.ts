// The people in the demo: names, roles, avatar colors, plus app-only data Nessie doesn't
// store (card limits, savings goals). Money data itself comes from Nessie (lib/nessie/).

import type { SavingsGoal } from './types';

export const DEMO_ASOF = '2026-11-07'; // "today" for the demo, so results never drift

export type Role = 'self' | 'spouse' | 'dependent' | 'friend';

export interface Person {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  initial: string;
  color: string;
  phone?: string;
  hasAccounts: boolean; // false = no bank accounts (e.g. a 10-year-old)
  cardLimit?: number;
  goals: SavingsGoal[];
}

export const PEOPLE: Person[] = [
  {
    id: 'alex', name: 'Alex', role: 'self', roleLabel: 'Household owner', initial: 'A', color: '#1F4FD8',
    hasAccounts: true, cardLimit: 2000, goals: [{ id: 'orlando', name: 'Orlando fund', amount: 300, huddleId: 'orlando' }],
  },
  { id: 'jordan', name: 'Jordan', role: 'spouse', roleLabel: 'Spouse', initial: 'J', color: '#6B4FBB', hasAccounts: true, cardLimit: 5000, goals: [] },
  { id: 'maya', name: 'Maya', role: 'dependent', roleLabel: 'Dependent · 16', initial: 'M', color: '#0F766E', hasAccounts: true, goals: [] },
  { id: 'leo', name: 'Leo', role: 'dependent', roleLabel: 'Dependent · 10', initial: 'L', color: '#B45309', hasAccounts: false, goals: [] },
  {
    id: 'sam', name: 'Sam', role: 'friend', roleLabel: 'Friend', initial: 'S', color: '#3D424C', phone: '555-0142',
    hasAccounts: true, cardLimit: 3000, goals: [],
  },
];

export function getPerson(id: string): Person {
  return PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];
}

export const HOUSEHOLD_IDS = ['alex', 'jordan', 'maya', 'leo'];
