import { describe, expect, it } from 'vitest';
import type { FinancialPicture } from '../../types';
import { dataHash } from '../hash';
import { scoreHealth } from '../health';
import { EMERGENCY_SAVINGS_FLAG, checkSource, freeSavings } from '../source';
import { ASOF, alex } from './fixtures';

const statuses = (r: ReturnType<typeof scoreHealth>) => r.indicators.map((i) => i.status);

describe('checkSource', () => {
  it('checking is always fine', () => {
    expect(checkSource(alex, 500, 'checking')).toMatchObject({ usesEmergencySavings: false, flag: null });
  });
  it('savings without a goal is emergency money', () => {
    expect(checkSource(alex, 180, 'savings')).toMatchObject({ fromFree: 180, usesEmergencySavings: true, flag: EMERGENCY_SAVINGS_FLAG });
  });
  it('savings set aside for this goal is fine', () => {
    expect(checkSource(alex, 300, 'savings', 'orlando')).toMatchObject({ fromGoal: 300, fromFree: 0, flag: null });
  });
  it('going past the goal amount spills into emergency savings', () => {
    expect(checkSource(alex, 400, 'savings', 'orlando')).toMatchObject({ fromGoal: 300, fromFree: 100, usesEmergencySavings: true });
  });
  it('free savings = savings minus money set aside', () => {
    expect(freeSavings(alex)).toBe(600);
  });
});

describe('scoreHealth: Alex today', () => {
  const r = scoreHealth(alex, { asOf: ASOF, trigger: 'seed' });

  it('scores 60, Watch (yellow)', () => {
    expect(r.score).toBe(60);
    expect(r.overall).toBe('yellow');
  });

  it('has the 5 indicators with the right weights and colors', () => {
    expect(r.indicators.map((i) => [i.key, i.weight])).toEqual([
      ['essentialBills', 40], ['cushion', 20], ['debtLoad', 15], ['savingsProtection', 15], ['nonEssential', 10],
    ]);
    expect(statuses(r)).toEqual(['yellow', 'red', 'green', 'green', 'green']);
  });

  it('explains each number', () => {
    const [bills, cushion, debt, , ne] = r.indicators;
    expect(bills).toMatchObject({ value: 106.4, display: '$106' });
    expect(bills.explanation).toContain('Nov 12');
    expect(cushion.display).toBe('0.3 mo');
    expect(debt.display).toBe('8.4%'); // ($310 + $27) ÷ $4,008
    expect(ne.display).toBe('2.1%');
  });

  it('includes a 30-day forecast, the hash and the trigger', () => {
    expect(r.forecast).toHaveLength(31);
    expect(r.dataHash).toBe(dataHash(alex));
    expect(r.trigger).toBe('seed');
    expect(r.flags).toEqual([]);
  });
});

describe('scoreHealth: what-ifs (the demo moments)', () => {
  it('$180 from emergency savings → 45, red, flagged', () => {
    const r = scoreHealth(alex, { asOf: ASOF, changes: [{ kind: 'oneTime', amount: 180, source: 'savings', label: 'Best Buy' }] });
    expect(r.score).toBe(45);
    expect(r.overall).toBe('red');
    expect(r.indicators[3].status).toBe('red');
    expect(r.flags).toContain(EMERGENCY_SAVINGS_FLAG);
  });

  it('$180 from the Orlando fund → no penalty', () => {
    const r = scoreHealth(alex, { asOf: ASOF, changes: [{ kind: 'oneTime', amount: 180, source: 'savings', goalId: 'orlando', label: 'Orlando deposit' }] });
    expect(r.score).toBe(60);
    expect(r.flags).toEqual([]);
  });

  it('$900 PS6 from checking today → bills not covered → 40, red', () => {
    const r = scoreHealth(alex, { asOf: ASOF, changes: [{ kind: 'oneTime', amount: 900, label: 'PS6' }] });
    expect(r.indicators[0]).toMatchObject({ status: 'red', value: -793.6 });
    expect(r.score).toBe(40);
    expect(r.overall).toBe('red');
  });

  it('keeping $100 more in checking → bills green → 80', () => {
    const r = scoreHealth({ ...alex, accounts: alex.accounts.map((a) => (a.id === 'a1' ? { ...a, balance: 486.4 } : a)) }, { asOf: ASOF });
    expect(r.indicators[0].status).toBe('green');
    expect(r.score).toBe(80);
  });
});

describe('hard rule', () => {
  it('missing an essential bill is red even if the score says yellow', () => {
    const healthy: FinancialPicture = {
      ...alex,
      accounts: alex.accounts.map((a) => (a.type === 'Savings' ? { ...a, balance: 6000 } : a)),
    };
    const r = scoreHealth(healthy, { asOf: ASOF, changes: [{ kind: 'oneTime', amount: 900, label: 'Big purchase' }] });
    expect(r.score).toBe(60); // 0 + 20 + 15 + 15 + 10
    expect(r.overall).toBe('red');
  });
});

describe('edge cases', () => {
  it('no paycheck and a loan → debt load red', () => {
    const r = scoreHealth({ ...alex, paycheck: null }, { asOf: ASOF });
    expect(r.indicators[2]).toMatchObject({ status: 'red', display: 'No income' });
  });

  it('cancelling Hulu lowers non-essential spending', () => {
    const r = scoreHealth(alex, { asOf: ASOF, changes: [{ kind: 'cancelObligation', amount: 0, obligationKey: 'detected:hulu', label: 'Cancel Hulu' }] });
    expect(r.indicators[4].value).toBeLessThan(scoreHealth(alex, { asOf: ASOF }).indicators[4].value);
  });
});

describe('dataHash + determinism', () => {
  it('same data → same result, every time', () => {
    expect(scoreHealth(alex, { asOf: ASOF })).toEqual(scoreHealth(alex, { asOf: ASOF }));
  });
  it('order of accounts/bills does not change the hash', () => {
    const shuffled = { ...alex, accounts: [...alex.accounts].reverse(), obligations: [...alex.obligations].reverse() };
    expect(dataHash(shuffled)).toBe(dataHash(alex));
  });
  it('a one-cent change does change the hash', () => {
    const changed = { ...alex, accounts: alex.accounts.map((a) => (a.id === 'a1' ? { ...a, balance: 386.41 } : a)) };
    expect(dataHash(changed)).not.toBe(dataHash(alex));
  });
});
