import { describe, expect, it } from 'vitest';
import { canAfford } from '../afford';
import { capacity, checkPledge, fairSplit, shortfall, weeksUntil } from '../split';
import { ASOF, alex } from './fixtures';

describe('canAfford', () => {
  it('$120 concert after payday from checking → yes', () => {
    const r = canAfford(alex, { label: 'Concert', cost: 120, date: '2026-11-21', source: 'checking' }, ASOF);
    expect(r.verdict).toBe('yes');
    expect(r.scoreAfter).toBe(r.scoreBefore);
  });

  it('$900 PS6 today → not today (bills), but yes after the Nov 13 paycheck', () => {
    const r = canAfford(alex, { label: 'PS6', cost: 900, source: 'checking' }, ASOF);
    expect(r.verdict).toBe('yesIf');
    expect([r.scoreBefore, r.scoreAfter]).toEqual([60, 40]);
    expect(r.readyDate).toBe('2026-11-13');
    expect(r.reason).toContain('Nov 12');
  });

  it('$180 from emergency savings → no, with a checking alternative', () => {
    const r = canAfford(alex, { label: 'Headphones', cost: 180, source: 'savings' }, ASOF);
    expect(r.verdict).toBe('no');
    expect(r.reason).toContain('emergency savings');
    expect(r.reason).toContain('Nov 13');
  });

  it('$180 from the Orlando fund → yes', () => {
    expect(canAfford(alex, { label: 'Park tickets', cost: 180, source: 'savings', goalId: 'orlando' }, ASOF).verdict).toBe('yes');
  });

  it('something huge → save-up plan with weekly amount and ready date', () => {
    const r = canAfford(alex, { label: 'Laptop', cost: 2400, source: 'checking' }, ASOF);
    expect(r.verdict).toBe('yesIf');
    expect(r.weeklySavingsNeeded).toBe(120);
    expect(r.readyDate).toBe('2027-03-27');
  });
});

describe('huddle math', () => {
  const trip = '2027-03-20';

  it('weeks until the trip', () => {
    expect(weeksUntil(ASOF, trip)).toBe(19);
  });

  it('capacity = 10% of pay per week until the trip, rounded down to $50', () => {
    expect(capacity(alex, trip, ASOF)).toBe(1750); // $925/wk × 10% × 19 weeks = $1,757
  });

  it('pledge from checking within capacity passes', () => {
    const r = checkPledge(alex, { amount: 900, source: 'checking' }, trip, ASOF);
    expect(r.passed).toBe(true);
    expect(r.weekly).toBe(48);
  });

  it('pledge from emergency savings fails privately, with a checking suggestion', () => {
    const r = checkPledge(alex, { amount: 900, source: 'savings' }, trip, ASOF);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('emergency savings');
    expect(r.suggestion).toMatchObject({ amount: 900, source: 'checking', weekly: 48 });
  });

  it('pledge over capacity fails and suggests the max', () => {
    const r = checkPledge(alex, { amount: 3000, source: 'checking' }, trip, ASOF);
    expect(r.passed).toBe(false);
    expect(r.suggestion?.amount).toBe(1750);
  });

  it('pledge from the trip fund passes', () => {
    expect(checkPledge(alex, { amount: 300, source: 'savings', goalId: 'orlando' }, trip, ASOF).passed).toBe(true);
  });

  it('fair split is proportional and adds up exactly', () => {
    const split = fairSplit(4000, { alex: 1750, jordan: 2450, sam: 2050, maya: 100 });
    expect(Object.values(split).reduce((s, v) => s + v, 0)).toBe(4000);
    expect(split.jordan).toBeGreaterThan(split.alex);
  });

  it('shortfall', () => {
    expect(shortfall(4000, [1800, 100, 900, 800])).toBe(400);
    expect(shortfall(4000, [2000, 2500])).toBe(0);
  });
});
