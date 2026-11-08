import { describe, expect, it } from 'vitest';
import fixture from '../local.json';
import { randomProfile } from '../demo-profile';
import { toPicture, type NessieMember } from '../picture';
import { DEMO_ASOF } from '../../people';
import { scoreHealth } from '../../engine/health';

describe('Nessie-derived demo profiles', () => {
  const template = fixture.members.alex as unknown as NessieMember;
  it('varies balances and obligations while keeping cents and a detectable payroll cadence', () => {
    const low = randomProfile(template, () => 0);
    const high = randomProfile(template, () => 0.99);
    expect(low.checkingCents).not.toBe(high.checkingCents);
    expect(low.savingsCents).not.toBe(high.savingsCents);
    expect(low.bills[0].amountCents).not.toBe(high.bills[0].amountCents);
    expect(new Set(low.deposits.map((d) => d.amountCents)).size).toBe(1);
    expect(low.deposits.map((d) => d.date)).toEqual(template.accounts[0].deposits.map((d) => d.transaction_date).sort());
    for (const n of [low.checkingCents, high.savingsCents, ...low.purchases.map((p) => p.amountCents)]) expect(Number.isSafeInteger(n)).toBe(true);
  });

  it('creates scenarios with different engine outcomes without inventing scores', () => {
    const scores = [0, 0.5, 0.99].map((value) => {
      const p = randomProfile(template, () => value);
      const checking = template.accounts.find((a) => a.type === 'Checking')!;
      const savings = template.accounts.find((a) => a.type === 'Savings')!;
      const member: NessieMember = { customerId: 'demo', name: 'Demo', accounts: [
        { ...checking, _id: 'checking', customer_id: 'demo', balance: p.checkingCents / 100,
          deposits: p.deposits.map((d, i) => ({ _id: `pay-${i}`, transaction_date: d.date, amount: d.amountCents / 100, status: 'completed', description: d.description })),
          purchases: p.purchases.map((t, i) => ({ _id: `buy-${i}`, merchant_id: t.merchantId, purchase_date: t.date, amount: t.amountCents / 100, status: 'completed' })),
          bills: p.bills.map((b, i) => ({ _id: `bill-${i}`, payee: b.payee, payment_date: b.date, payment_amount: b.amountCents / 100, status: 'recurring' })), loans: [], withdrawals: [] },
        { ...savings, _id: 'savings', customer_id: 'demo', balance: p.savingsCents / 100 },
      ] };
      const picture = toPicture(member, { id: 'member', name: 'Demo', role: 'self', roleLabel: '', initial: 'D', color: '', hasAccounts: true, goals: [] }, fixture.merchants, DEMO_ASOF);
      const result = scoreHealth(picture, { asOf: DEMO_ASOF });
      expect(result.missingInputs).toEqual([]);
      expect(result.score).not.toBeNull();
      return result.score;
    });
    expect(new Set(scores).size).toBeGreaterThan(1);
  });
});
