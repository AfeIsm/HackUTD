import { describe, expect, it } from 'vitest';
import { forecastBalance } from '../forecast';
import { ASOF, alex } from './fixtures';
const at = (p: { date: string; balance: number }[], d: string) => p.find((x) => x.date === d)?.balance;

describe('account-specific forecasts', () => {
  const base = forecastBalance(alex, { asOf: ASOF });
  it('starts from current balances without replaying historical transactions', () => {
    expect(base.byAccount.a1[0].balance).toBe(38640);
    const p = { ...alex, txns: [{ id: 'old', accountId: 'a1', kind: 'purchase' as const, amount: 10000, date: '2026-10-01', description: 'Past' }] };
    expect(forecastBalance(p, { asOf: ASOF })).toEqual(base);
  });
  it('adds pay only to its receiving account', () => {
    const p = { ...alex, accounts: [...alex.accounts, { ...alex.accounts[0], id: 'second', balance: 0 }] };
    const f = forecastBalance(p, { asOf: ASOF });
    expect(at(f.byAccount.a1, '2026-11-13')).toBe(195640);
    expect(at(f.byAccount.second, '2026-11-13')).toBe(0);
  });
  it('purchase from a goal reduces savings and does not create a transfer back into savings', () => {
    const f = forecastBalance(alex, { asOf: ASOF, changes: [{ kind: 'oneTime', sourceAccountId: 'a2', goalId: 'orlando', amount: 18000, label: 'Tickets' }] });
    expect(f.byAccount.a2[0].balance).toBe(72000);
    expect(f.byAccount.a1).toEqual(base.byAccount.a1);
  });
  it('an explicit internal transfer has both effects and creates no income', () => {
    const f = forecastBalance(alex, { asOf: ASOF, changes: [{ kind: 'oneTime', sourceAccountId: 'a1', destinationAccountId: 'a2', amount: 1000, label: 'Save' }] });
    expect(f.byAccount.a1[0].balance).toBe(37640);
    expect(f.byAccount.a2[0].balance).toBe(91000);
    expect(f.checking[0].balance + f.savings[0].balance).toBe(base.checking[0].balance + base.savings[0].balance);
  });
  it('weekly and monthly changes use exact accounts and cents', () => {
    const f = forecastBalance(alex, { asOf: ASOF, changes: [{ kind: 'weekly', sourceAccountId: 'a1', destinationAccountId: 'a2', amount: 4500, label: 'Save' }] });
    expect(f.savings.at(-1)!.balance).toBe(108000);
    expect(f.checking.at(-1)!.balance).toBe(base.checking.at(-1)!.balance - 18000);
    expect(f.checking.every((p) => Number.isSafeInteger(p.balance))).toBe(true);
  });
  it('scheduled cancellations preserve expenses until their effective date', () => {
    const f = forecastBalance(alex, { asOf: ASOF, changes: [{ kind: 'cancelObligation', obligationKey: 'detected:hulu', date: '2026-12-01', amount: 0, label: 'Cancel' }] });
    expect(f.checking).toEqual(base.checking);
  });
  it('monthly schedules recover the 31st after February', () => {
    const p = { ...alex, paycheck: null, reservations: [], obligations: [{ ...alex.obligations[0], amount: 100, nextDate: '2027-01-31' }] };
    const f = forecastBalance(p, { asOf: '2027-01-30', days: 61 });
    expect(at(f.byAccount.a1, '2027-03-30')).toBe(38440);
    expect(at(f.byAccount.a1, '2027-03-31')).toBe(38340);
  });
  it('semi-monthly income uses calendar days across February', () => {
    const p = { ...alex, obligations: [], paycheck: { accountId: 'a1', avgAmount: 100, cadenceDays: 15, semiMonthlyDays: [15, 31] as [number, number], nextDate: '2027-02-15' } };
    const f = forecastBalance(p, { asOf: '2027-02-01', days: 45 });
    expect(at(f.byAccount.a1, '2027-02-28')).toBe(38840);
    expect(at(f.byAccount.a1, '2027-03-14')).toBe(38840);
    expect(at(f.byAccount.a1, '2027-03-15')).toBe(38940);
  });
  it('an old reservation is retained as an immediate outflow', () => {
    const f = forecastBalance({ ...alex, reservations: [{ id: 'r', sourceAccountId: 'a1', amount: 101, date: '2026-11-01' }] }, { asOf: ASOF });
    expect(f.byAccount.a1[0].balance).toBe(38539);
  });
});
