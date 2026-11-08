import { describe, expect, it } from 'vitest';
import { canAfford } from '../afford';
import { capacity, checkPledge, fairSplit, shortfall } from '../split';
import { ASOF, alex } from './fixtures';
const healthy = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const buy = (p = healthy, cost = 12000, sourceAccountId = 'a1', date = ASOF) => canAfford(p, { label: 'Purchase', cost, sourceAccountId, date }, ASOF);

describe('purchase approval', () => {
  it('approves only a complete green result', () => expect(buy().verdict).toBe('yes'));
  it('unchanged yellow is not Yes', () => {
    const r = buy(alex, 100);
    expect(r.scoreBefore).toBe(60); expect(r.scoreAfter).toBe(60); expect(r.verdict).toBe('no');
  });
  it('does not use a rich second account to fund the selected account', () => {
    const p = { ...healthy, accounts: [...healthy.accounts, { ...healthy.accounts[0], id: 'rich', balance: 10000000 }] };
    expect(buy(p, 3000000).verdict).toBe('no');
  });
  it('verifies a later payday on the same account before offering Yes if', () => {
    const r = buy(healthy, 90000);
    expect(r.verdict).toBe('yesIf'); expect(r.readyDate).toBe('2026-11-13');
    expect(r.verifiedAlternative?.sourceAccountId).toBe('a1');
    expect(r.verifiedAlternative?.result.overall).toBe('green');
  });
  it('does not switch savings to checking without a new question', () => {
    expect(buy(healthy, 70000, 'a2').verdict).toBe('no');
  });
  it('rejects nonowned, unknown and credit-card accounts', () => {
    for (const id of ['a3', 'unknown']) expect(buy(healthy, 100, id).verdict).toBe('no');
  });
  it.each([0, -1, 10.1, Infinity, NaN])('rejects invalid purchase cents %s', (cost) => expect(buy(healthy, cost).verdict).toBe('no'));
  it.each(['2026-11-06', '2026-02-30', 'not-a-date'])('rejects invalid or historical date %s', (date) => expect(buy(healthy, 100, 'a1', date).verdict).toBe('no'));
  it('does not approve a purchase beyond the original 30-day forecast without simulating its date', () => {
    const p = { ...healthy, paycheck: { ...healthy.paycheck!, avgAmount: 1 }, obligations: [] };
    const r = buy(p, 900000, 'a1', '2027-02-01');
    expect(r.verdict).toBe('no');
  });
  it('blocks missing income and preserves before/after indicators', () => {
    const r = buy({ ...healthy, paycheck: null }, 100);
    expect(r.verdict).toBe('no'); expect(r.scoreAfter).toBeNull();
    expect(r.after.indicators).toHaveLength(5); expect(r.missingInputs.length).toBeGreaterThan(0);
  });
  it('checks existing reservations alongside the candidate', () => {
    const p = { ...healthy, reservations: [{ id: 'other', sourceAccountId: 'a1', amount: 70000, date: ASOF }] };
    expect(buy(p, 20000).verdict).toBe('no');
  });
  it('a matching goal purchase keeps its account funds separate', () => {
    const r = canAfford(healthy, { label: 'Tickets', cost: 18000, sourceAccountId: 'a2', goalId: 'orlando' }, ASOF);
    expect(r.verdict).toBe('yes'); expect(r.after.accountForecasts.a2[0].balance).toBe(72000);
  });
  it('does not fabricate a long-term savings plan', () => {
    const r = buy(healthy, 100000000);
    expect(r.verdict).toBe('no'); expect(r.weeklySavingsNeeded).toBeUndefined(); expect(r.readyDate).toBeUndefined();
  });
});
describe('immediate-funding Huddle checks', () => {
  it('future income cannot fund today’s contribution', () => {
    expect(checkPledge(alex, { amount: 90000, sourceAccountId: 'a1' }, '2027-03-20', ASOF).passed).toBe(false);
    expect(capacity(alex, '2027-03-20', ASOF)).toBe(0);
  });
  it('a risky pledge is allowed, but warns and names the bill at stake', () => {
    const r = checkPledge(alex, { amount: 100, sourceAccountId: 'a1' }, '2027-03-20', ASOF);
    expect(r.passed).toBe(true); expect(r.safe).toBe(false);
    expect(r.warning).toMatch(/still need to pay Rent \(\$1,200, due Dec 1\)/);
    expect(r.reason).toBe(r.warning);
  });
  it('safe stays green-only, so "you can add this and stay healthy" stays true', () => expect(capacity(alex, '2027-03-20', ASOF)).toBe(0));
  it('a funded green exact-account contribution can pass', () => expect(checkPledge(healthy, { amount: 12000, sourceAccountId: 'a1' }, '2027-03-20', ASOF).passed).toBe(true));
  it('fair split never exceeds available capacities and preserves exact cents', () => {
    const split = fairSplit(101, { a: 50, b: 100 });
    expect(Object.values(split).reduce((s, n) => s + n, 0)).toBe(101);
    const short = fairSplit(1000, { a: 50, b: 100 });
    expect(short).toEqual({ a: 50, b: 100 }); expect(shortfall(1000, Object.values(short))).toBe(850);
  });
});
