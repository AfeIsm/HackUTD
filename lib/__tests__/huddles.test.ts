import { describe, expect, it } from 'vitest';
import { checkPledge } from '../engine/split';
import { agree, createHuddle, getHuddleState, publicParticipants, submitPledge } from '../huddles';
import { ASOF, alex } from '../engine/__tests__/fixtures';

describe('Huddle financial-contract integration', () => {
  it('does not start with unverified seeded commitments', () => {
    const h = getHuddleState().huddles.find((h) => h.id === 'orlando')!;
    expect(h.participants.some((p) => p.committed)).toBe(false);
    expect(publicParticipants(h).every((p) => p.pledge === null)).toBe(true);
  });
  it('does not commit an unaffordable or yellow pledge', () => {
    const id = createHuddle({ name: 'Private check', totalCost: 100, targetDate: '2027-03-20', createdBy: 'alex', members: [{ id: 'alex', isPaying: true }] });
    const pledge = { amount: 100, sourceAccountId: 'a1' };
    submitPledge(id, 'alex', pledge, checkPledge(alex, pledge, '2027-03-20', ASOF));
    const h = getHuddleState().huddles.find((h) => h.id === id)!;
    expect(h.participants[0].committed).toBe(false);
    expect(h.participants[0].sourceAccountId).toBe('a1');
    expect(JSON.stringify(publicParticipants(h))).not.toContain('a1');
  });
  it('a green contribution retains its exact account and can progress to agreement', () => {
    const id = createHuddle({ name: 'Green plan', totalCost: 100, targetDate: '2027-03-20', createdBy: 'alex', members: [{ id: 'alex', isPaying: true }] });
    const p = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
    const pledge = { amount: 100, sourceAccountId: 'a1' };
    submitPledge(id, 'alex', pledge, checkPledge(p, pledge, '2027-03-20', ASOF));
    expect(getHuddleState().huddles.find((h) => h.id === id)?.phase).toBe('agreeing');
    agree(id, 'alex');
    expect(getHuddleState().huddles.find((h) => h.id === id)?.phase).toBe('locked');
  });
});
