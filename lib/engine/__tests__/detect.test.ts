import { describe, expect, it } from 'vitest';
import type { Txn } from '../../types';
import { detectPaychecks, detectRecurring } from '../detect';

// Alex's last ~60 days (matches the demo seed: $1,850 every 14 days, 5 subscriptions).
let nextId = 0;
function txn(fields: Omit<Txn, 'id' | 'accountId'>): Txn {
  nextId += 1;
  return { id: `t${String(nextId).padStart(3, '0')}`, accountId: 'alex-checking', ...fields };
}

const pay = (date: string, amount = 1850) =>
  txn({ kind: 'deposit', amount, date, description: `ACME CORP PAYROLL ${date.replace(/-/g, '')}` });
const buy = (date: string, merchant: string, amount: number, category: string) =>
  txn({ kind: 'purchase', amount, date, description: merchant.toUpperCase(), merchant, category });

const alex: Txn[] = [
  pay('2026-09-18'), pay('2026-10-02'), pay('2026-10-16'), pay('2026-10-30'),
  txn({ kind: 'deposit', amount: 40, date: '2026-10-05', description: 'Venmo from Sam' }),
  buy('2026-09-12', 'T-Mobile', 65, 'Phone'), buy('2026-10-12', 'T-Mobile', 65, 'Phone'),
  buy('2026-09-14', 'Netflix', 15.49, 'Entertainment'), buy('2026-10-14', 'Netflix', 15.49, 'Entertainment'),
  buy('2026-09-16', 'Spotify', 11.99, 'Entertainment'), buy('2026-10-16', 'Spotify', 11.99, 'Entertainment'),
  buy('2026-09-21', 'Hulu', 17.99, 'Entertainment'), buy('2026-10-21', 'Hulu', 17.99, 'Entertainment'),
  buy('2026-09-28', 'Planet Fitness', 40, 'Fitness'), buy('2026-10-28', 'Planet Fitness', 40, 'Fitness'),
  // Not recurring: same store, different amounts and gaps
  buy('2026-09-20', 'H-E-B', 42.1, 'Groceries'), buy('2026-09-27', 'H-E-B', 88.45, 'Groceries'),
  buy('2026-10-09', 'H-E-B', 61.3, 'Groceries'), buy('2026-10-24', 'H-E-B', 35.8, 'Groceries'),
  buy('2026-10-03', 'Chipotle', 13.25, 'Dining'), buy('2026-10-19', 'Torchy’s Tacos', 22.4, 'Dining'),
];

describe('detectPaychecks', () => {
  it('finds Alex’s biweekly $1,850 paycheck and the next payday', () => {
    expect(detectPaychecks(alex)).toEqual({ avgAmount: 1850, cadenceDays: 14, nextDate: '2026-11-13' });
  });

  it('rolls nextDate forward past asOf', () => {
    expect(detectPaychecks(alex, '2026-11-13')?.nextDate).toBe('2026-11-27');
  });

  it('ignores one-off deposits', () => {
    const onlyVenmo = alex.filter((t) => t.description.startsWith('Venmo'));
    expect(detectPaychecks(onlyVenmo)).toBeNull();
  });

  it('rejects deposits whose amounts vary more than 10%', () => {
    expect(detectPaychecks([pay('2026-10-02', 1850), pay('2026-10-16', 1200)])).toBeNull();
  });

  it('returns null for no transactions', () => {
    expect(detectPaychecks([])).toBeNull();
  });

  it('tells semi-monthly (15 days) apart from biweekly (14 days)', () => {
    const semi = [pay('2026-09-15', 150), pay('2026-09-30', 150), pay('2026-10-15', 150), pay('2026-10-30', 150)];
    expect(detectPaychecks(semi)?.cadenceDays).toBe(15);
  });
});

describe('detectRecurring', () => {
  const found = detectRecurring(alex);
  const byName = (name: string) => found.find((o) => o.name === name);

  it('finds exactly the 5 subscriptions, not groceries or dining', () => {
    expect(found.map((o) => o.name).sort()).toEqual(['Hulu', 'Netflix', 'Planet Fitness', 'Spotify', 'T-Mobile']);
  });

  it('gets amount, cadence and next date right', () => {
    expect(byName('Netflix')).toMatchObject({ amount: 15.49, cadence: 'monthly', nextDate: '2026-11-14', origin: 'detected' });
  });

  it('tags the phone bill essential and streaming non-essential', () => {
    expect(byName('T-Mobile')?.essential).toBe(true);
    expect(byName('Netflix')?.essential).toBe(false);
  });

  it('returns [] for no transactions', () => {
    expect(detectRecurring([])).toEqual([]);
  });

  it('does not call two coffees two weeks apart a subscription', () => {
    const coffee = [buy('2026-09-26', 'Starbucks', 6.95, 'Dining'), buy('2026-10-09', 'Starbucks', 7.45, 'Dining')];
    expect(detectRecurring(coffee)).toEqual([]);
  });
});

describe('determinism (same data → same result)', () => {
  it('gives identical output for shuffled input', () => {
    const shuffled = [...alex].reverse();
    expect(detectPaychecks(shuffled)).toEqual(detectPaychecks(alex));
    expect(detectRecurring(shuffled)).toEqual(detectRecurring(alex));
  });
});
