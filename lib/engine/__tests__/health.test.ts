import { describe, expect, it } from 'vitest';
import { scoreHealth } from '../health';
import { dataHash } from '../hash';
import { checkSource, freeSavings } from '../source';
import { parseMoney, toCents } from '../money';
import { ASOF, alex } from './fixtures';

const healthy = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };

describe('integer money boundaries', () => {
  it('converts provider decimals and exact form input to cents', () => {
    expect(toCents(386.4)).toBe(38640);
    expect(parseMoney('180.01')).toBe(18001);
    expect(parseMoney('0.10')! + parseMoney('0.20')!).toBe(30);
  });
  it.each(['NaN', 'Infinity', '-3', '1.001', '1e4', ''])('rejects invalid form money: %s', (s) => expect(parseMoney(s)).toBeNull());
  it('rejects nonfinite provider money', () => expect(() => toCents(NaN)).toThrow());
});
describe('exact source and goal protection', () => {
  it('links the earmark to its savings account', () => {
    expect(checkSource(alex, 18000, 'a2', 'orlando')).toMatchObject({ valid: true, fromGoal: 18000, fromFree: 0 });
    expect(checkSource(alex, 40000, 'a2', 'orlando')).toMatchObject({ fromGoal: 30000, fromFree: 10000 });
    expect(freeSavings(alex, 'a2')).toBe(60000);
  });
  it('blocks unknown accounts, foreign accounts and cards', () => {
    for (const id of ['unknown', 'a3']) expect(checkSource(alex, 100, id).valid).toBe(false);
    const foreign = { ...alex, accounts: [...alex.accounts, { ...alex.accounts[0], id: 'foreign', ownerMemberId: 'sam' }] };
    expect(checkSource(foreign, 100, 'foreign').valid).toBe(false);
  });
  it('does not spend another account’s goal or another goal’s protected money', () => {
    expect(checkSource(alex, 100, 'a1', 'orlando').valid).toBe(false);
    expect(checkSource(alex, 70000, 'a2').valid).toBe(false);
  });
  it('a matching reservation replaces its earmark instead of counting twice', () => {
    const reserved = { ...alex, reservations: [{ id: 'r1', sourceAccountId: 'a2', amount: 30000, date: ASOF, goalId: 'orlando' }] };
    expect(freeSavings(reserved)).toBe(60000);
    expect(checkSource(reserved, 100, 'a2', 'orlando').fromGoal).toBe(0);
  });
});
describe('health policy', () => {
  it('retains five weighted indicators and reproducible known fixture results', () => {
    const r = scoreHealth(alex, { asOf: ASOF });
    expect([r.score, r.overall]).toEqual([60, 'yellow']);
    expect(r.indicators.map((i) => i.weight)).toEqual([40, 20, 15, 15, 10]);
    expect(r.forecast).toHaveLength(31);
    expect(r.accountForecasts.a1).toHaveLength(31);
    expect(r.indicators[0].value).toBe(10640);
    expect(scoreHealth(alex, { asOf: ASOF })).toEqual(r);
  });
  it('includes nonessential scheduled expenses before approving essential-bill coverage', () => {
    const p = { ...healthy, obligations: [...healthy.obligations, { ...healthy.obligations[0], key: 'large-sub', name: 'Subscription', essential: false, origin: 'detected' as const, amount: 90000, nextDate: ASOF }] };
    expect(scoreHealth(p, { asOf: ASOF }).overall).toBe('red');
  });
  it('cannot conceal one account’s overdraft with a second account', () => {
    const p = { ...alex, accounts: [...alex.accounts, { ...alex.accounts[0], id: 'rich', balance: 10000000 }] };
    const r = scoreHealth(p, { asOf: ASOF, changes: [{ kind: 'oneTime', sourceAccountId: 'a1', amount: 90000, label: 'Purchase' }] });
    expect(r.overall).toBe('red');
    expect(r.indicators[0].value).toBe(-79360);
  });
  it('uses savings thresholds rather than automatically denying all cushion use', () => {
    const p = { ...healthy, accounts: healthy.accounts.map((a) => a.id === 'a2' ? { ...a, balance: 1000000 } : a) };
    const r = scoreHealth(p, { asOf: ASOF, changes: [{ kind: 'oneTime', sourceAccountId: 'a2', amount: 5000, label: 'Purchase' }] });
    expect(r.indicators[3].status).toBe('yellow');
    expect(r.overall).toBe('green');
  });
  it('uses a fixed pre-scenario savings baseline for the 10% threshold', () => {
    const r = scoreHealth(healthy, { asOf: ASOF, changes: [{ kind: 'oneTime', sourceAccountId: 'a2', amount: 9000, label: 'Purchase' }] });
    expect(r.indicators[3].status).toBe('red');
  });
  it('does not consume the same goal allocation twice across scenarios', () => {
    const r = scoreHealth(healthy, { asOf: ASOF, changes: [1, 2].map(() => ({ kind: 'oneTime' as const, sourceAccountId: 'a2', goalId: 'orlando', amount: 20000, label: 'Purchase' })) });
    expect(r.indicators[3].value).toBe(10000);
  });
  it('future cancellations do not improve the current monthly subscription ratio early', () => {
    const r = scoreHealth(alex, { asOf: ASOF, changes: [{ kind: 'cancelObligation', amount: 0, obligationKey: 'detected:hulu', date: '2026-12-01', label: 'Cancel later' }] });
    expect(r.indicators[4].value).toBe(scoreHealth(alex, { asOf: ASOF }).indicators[4].value);
  });
  it('reservations affect account capacity once', () => {
    const r = scoreHealth(healthy, { asOf: ASOF });
    const reserved = scoreHealth({ ...healthy, reservations: [{ id: 'r1', sourceAccountId: 'a1', amount: 10000, date: ASOF }] }, { asOf: ASOF });
    expect(reserved.forecast[0].balance).toBe(r.forecast[0].balance - 10000);
  });
});
describe('incomplete assessments', () => {
  it('missing income blocks approval instead of fabricating favorable ratios', () => {
    const r = scoreHealth({ ...healthy, accounts: healthy.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 999999 } : a), paycheck: null }, { asOf: ASOF });
    expect(r.score).toBeNull(); expect(r.overall).toBe('needsInput');
    expect(r.indicators[2].status).toBe('needsInput');
    expect(r.indicators[4].status).toBe('needsInput');
    expect(r.missingInputs.join(' ')).toContain('income');
  });
  it('does not invent a card minimum', () => {
    const p = { ...healthy, accounts: healthy.accounts.map((a) => ({ ...a, minimumPayment: undefined })) };
    expect(scoreHealth(p, { asOf: ASOF }).missingInputs.join(' ')).toContain('minimum');
  });
  it('blocks overallocated goals and fractional cent inputs', () => {
    for (const p of [
      { ...healthy, goals: [{ ...healthy.goals[0], amount: 100000 }] },
      { ...healthy, accounts: healthy.accounts.map((a) => ({ ...a, balance: a.balance + 0.5 })) },
    ]) expect(scoreHealth(p, { asOf: ASOF }).score).toBeNull();
  });
  it('catches a missing obligation account', () => {
    const p = { ...healthy, obligations: [{ ...healthy.obligations[0], accountId: 'unknown' }] };
    expect(scoreHealth(p, { asOf: ASOF }).overall).toBe('needsInput');
  });
});
describe('fingerprints', () => {
  it('ignores array order but includes reservations and one-cent changes', () => {
    expect(dataHash({ ...alex, accounts: [...alex.accounts].reverse() })).toBe(dataHash(alex));
    expect(dataHash({ ...alex, reservations: [{ id: 'r', sourceAccountId: 'a1', date: ASOF, amount: 1 }] })).not.toBe(dataHash(alex));
    expect(dataHash({ ...alex, accounts: alex.accounts.map((a) => ({ ...a, balance: a.balance + 1 })) })).not.toBe(dataHash(alex));
  });
});

describe('recorded purchases and reservations', () => {
  it('a recorded purchase from emergency savings shows the warning, not just a what-if', () => {
    const p = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a2' ? { ...a, balance: 72000 } : a),
      txns: [{ id: 'bb', accountId: 'a2', kind: 'purchase' as const, amount: 18000, date: ASOF, description: 'Best Buy' }] };
    expect(scoreHealth(p, { asOf: ASOF }).flags).toContain('This uses your emergency savings, not spending money.');
  });
  it('a recorded purchase fully covered by its goal does not', () => {
    const p = { ...alex, txns: [{ id: 'gl', accountId: 'a2', kind: 'purchase' as const, amount: 18000, goalAllocationUsed: 18000, date: ASOF, description: 'Tickets' }] };
    expect(scoreHealth(p, { asOf: ASOF }).flags).not.toContain('This uses your emergency savings, not spending money.');
  });
  it('records the unallocated portion of a purchase that exceeds its goal', () => {
    const p = { ...healthy, goals: [{ ...healthy.goals[0], amount: 0 }], accounts: healthy.accounts.map((a) => a.id === 'a2' ? { ...a, balance: 50000 } : a),
      txns: [{ id: 'spent', accountId: 'a2', kind: 'purchase' as const, amount: 40000, goalAllocationUsed: 30000, date: ASOF, description: 'Tickets', category: 'goal:orlando' }] };
    expect(scoreHealth(p, { asOf: ASOF }).indicators[3].value).toBe(10000);
  });
  it('does not reuse one earmark for multiple reservations', () => {
    const p = { ...healthy, reservations: [1, 2].map((i) => ({ id: `r${i}`, sourceAccountId: 'a2', goalId: 'orlando', amount: 20000, date: ASOF })) };
    expect(freeSavings(p)).toBe(50000);
    expect(scoreHealth(p, { asOf: ASOF }).indicators[3].value).toBe(10000);
  });
  it('a known checking shortfall remains red even when another input is missing', () => {
    const p = { ...alex, accounts: alex.accounts.map((a) => ({ ...a, minimumPayment: undefined })), reservations: [{ id: 'r', sourceAccountId: 'a1', amount: 90000, date: ASOF }] };
    const r = scoreHealth(p, { asOf: ASOF });
    expect(r.score).toBeNull(); expect(r.overall).toBe('red');
  });
});
