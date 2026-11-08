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
  cardLimit?: number; // explicit synthetic metadata, in cents
  cardAccountId?: string;
  cardMinimumPayment?: number;
  cardPaymentAccountId?: string;
  cardPaymentDay?: number;
  goals: SavingsGoal[];
}

export const PEOPLE: Person[] = [
  {
    id: 'alex', name: 'Alex', role: 'self', roleLabel: 'Household owner', initial: 'A', color: '#1F4FD8',
    hasAccounts: true, cardLimit: 200000, cardAccountId: 'ce85cd31-e2fb-4c3a-952c-e75ef5e03c5a', cardMinimumPayment: 2700, cardPaymentAccountId: '6480d61e-b78b-4860-a3ed-356dcbdfdc75', cardPaymentDay: 23, goals: [{ accountId: '53d7f927-41a0-4dd2-aa44-7f586bb79838', id: 'orlando', name: 'Orlando fund', amount: 30000, huddleId: 'orlando' }],
  },
  { id: 'jordan', name: 'Jordan', role: 'spouse', roleLabel: 'Spouse', initial: 'J', color: '#6B4FBB', hasAccounts: true, cardLimit: 500000, cardAccountId: '444bc6cf-2cce-407b-9f80-4b7004782878', cardMinimumPayment: 2500, cardPaymentAccountId: '56e73b3f-1794-486a-b634-f535f1de67dc', cardPaymentDay: 23, goals: [] },
  { id: 'maya', name: 'Maya', role: 'dependent', roleLabel: 'Dependent · 16', initial: 'M', color: '#0F766E', hasAccounts: true, goals: [] },
  { id: 'leo', name: 'Leo', role: 'dependent', roleLabel: 'Dependent · 10', initial: 'L', color: '#B45309', hasAccounts: false, goals: [] },
  {
    id: 'sam', name: 'Sam', role: 'friend', roleLabel: 'Friend', initial: 'S', color: '#3D424C', phone: '555-0142',
    hasAccounts: true, cardLimit: 300000, cardAccountId: 'b34b6c3d-3334-45f9-b8c7-99555687bdfa', cardMinimumPayment: 2500, cardPaymentAccountId: '4e2c0177-8310-4613-a9b3-f40c1a2fd762', cardPaymentDay: 23, goals: [],
  },
];

export function getPerson(id: string): Person {
  return PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];
}

export const HOUSEHOLD_IDS = ['alex', 'jordan', 'maya', 'leo']; // seed source only; real households live in Mongo

// Household members without a login (kids), keyed by the owner's memberId.
export const NO_LOGIN_MEMBERS: Record<string, { memberId: string; name: string; role: 'dependent' }[]> = {
  alex: [{ memberId: 'leo', name: 'Leo', role: 'dependent' }],
};

const COLORS = ['#1F4FD8', '#6B4FBB', '#0F766E', '#B45309', '#3D424C', '#BE185D', '#4D7C0F'];
/** Avatar initial + color for anyone (demo people keep their colors). */
export function lookOf(name: string, memberId: string | null): { initial: string; color: string } {
  const demo = PEOPLE.find((p) => p.id === memberId);
  if (demo) return { initial: demo.initial, color: demo.color };
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { initial: (name[0] ?? '?').toUpperCase(), color: COLORS[hash % COLORS.length] };
}
