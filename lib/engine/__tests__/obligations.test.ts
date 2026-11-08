import { describe, expect, it } from 'vitest';
import type { Bill, Loan, Obligation } from '../../types';
import { buildObligations } from '../obligations';

// Alex's seed: matches the mockup's 9 bills & subscriptions, $1,790/mo essential.
const bills: Bill[] = [
  { id: 'b1', payee: 'Rent', amount: 1200, nextDate: '2026-12-01', category: 'Housing' },
  { id: 'b2', payee: 'Electric', amount: 120, nextDate: '2026-11-10', category: 'Utilities' },
  { id: 'b3', payee: 'Car insurance', amount: 95, nextDate: '2026-11-12', category: 'Insurance' },
  { id: 'b4', payee: 'T-Mobile USA', amount: 65, nextDate: '2026-11-12', category: 'Phone' },
];

const loans: Loan[] = [{ id: 'l1', type: 'car', monthlyPayment: 310, nextDate: '2026-11-20' }];

const sub = (name: string, amount: number, nextDate: string, essential = false): Obligation => ({
  key: `detected:${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  name, amount, nextDate, cadence: 'monthly', essential, origin: 'detected',
});

// What detectRecurring finds on Alex's card (T-Mobile duplicates the bill above)
const recurring: Obligation[] = [
  sub('T-Mobile', 65, '2026-11-12', true),
  sub('Netflix', 15.49, '2026-11-14'),
  sub('Spotify', 11.99, '2026-11-16'),
  sub('Hulu', 17.99, '2026-11-21'),
  sub('Planet Fitness', 40, '2026-11-28'),
];

describe('buildObligations', () => {
  const list = buildObligations(bills, loans, recurring);

  it('merges bills, loans and subscriptions into one list of 9', () => {
    expect(list).toHaveLength(9);
    expect(list.map((o) => o.origin).filter((o) => o === 'loan')).toHaveLength(1);
  });

  it('counts the phone bill once, keeping the bill (not the card charge)', () => {
    const phones = list.filter((o) => /mobile/i.test(o.name));
    expect(phones).toHaveLength(1);
    expect(phones[0]).toMatchObject({ origin: 'bill', key: 'bill:b4' });
  });

  it('tags rent, utilities, insurance, phone and loans essential; streaming and gym not', () => {
    const essential = list.filter((o) => o.essential).map((o) => o.name).sort();
    expect(essential).toEqual(['Car insurance', 'Car loan', 'Electric', 'Rent', 'T-Mobile USA']);
    const monthlyEssential = list.filter((o) => o.essential).reduce((sum, o) => sum + o.amount, 0);
    expect(monthlyEssential).toBe(1790);
  });

  it('names loans readably', () => {
    expect(list.find((o) => o.origin === 'loan')?.name).toBe('Car loan');
  });

  it('applies the user’s tag overrides last', () => {
    const tagged = buildObligations(bills, loans, recurring, [
      { obligationKey: 'detected:planet-fitness', essential: true },
      { obligationKey: 'bill:b3', essential: false },
    ]);
    expect(tagged.find((o) => o.name === 'Planet Fitness')?.essential).toBe(true);
    expect(tagged.find((o) => o.name === 'Car insurance')?.essential).toBe(false);
  });

  it('sorts by due date, soonest first', () => {
    expect(list[0].name).toBe('Electric');
    expect(list[list.length - 1].name).toBe('Rent');
  });

  it('gives the same output no matter the input order', () => {
    const shuffled = buildObligations([...bills].reverse(), loans, [...recurring].reverse());
    expect(shuffled).toEqual(list);
  });

  it('handles empty inputs', () => {
    expect(buildObligations([], [], [])).toEqual([]);
  });
});
