import { describe, expect, it } from 'vitest';
import { checkPledge } from '../engine/split';
import { type Huddle, applyAgree, applyDecline, applyInviteAnswer, applyPledge, newParticipant, viewFor } from '../huddles';
import { ASOF, alex } from '../engine/__tests__/fixtures';

const huddle = (participants = [newParticipant('alex', 'u1', 'Alex')], totalCost = 100): Huddle => ({
  id: 'h1', name: 'Test', totalCost, targetDate: '2027-03-20', createdBy: 'alex', phase: 'pledging', round: 1,
  message: null, lastDecline: null, fairSplit: null, participants,
});
const rich = { ...alex, accounts: alex.accounts.map((a) => (a.id === 'a1' ? { ...a, balance: 80000 } : a)) };

describe('Huddle phase machine + privacy filter', () => {
  it('does not commit an unaffordable or yellow pledge, and never leaks the account', () => {
    const pledge = { amount: 100, sourceAccountId: 'a1' };
    const h = applyPledge(huddle(), 'alex', pledge, checkPledge(alex, pledge, '2027-03-20', ASOF));
    expect(h.participants[0].committed).toBe(false);
    expect(h.participants[0].sourceAccountId).toBe('a1');
    expect(JSON.stringify(viewFor(h, 'someone-else'))).not.toContain('a1');
  });

  it('a green contribution can progress to agreement and lock', () => {
    const pledge = { amount: 100, sourceAccountId: 'a1' };
    const h = applyPledge(huddle(), 'alex', pledge, checkPledge(rich, pledge, '2027-03-20', ASOF));
    expect(h.phase).toBe('agreeing');
    expect(applyAgree(h, 'alex').phase).toBe('locked');
  });

  it('hides amounts from others while pledging, shows them after reveal', () => {
    const two = huddle([newParticipant('alex', 'u1', 'Alex'), newParticipant('sam', 'u2', 'Sam')], 1000);
    const pass = { passed: true, scoreBefore: 90, scoreAfter: 88, reason: 'ok' };
    const one = applyPledge(two, 'alex', { amount: 300, sourceAccountId: 'a1' }, pass);
    const samView = viewFor(one, 'sam');
    expect(one.phase).toBe('pledging');
    expect(samView.participants.find((p) => p.memberId === 'alex')?.pledge).toBeNull();
    expect(samView.totalCommitted).toBeNull();
    expect(samView.me?.memberId).toBe('sam');
    expect(JSON.stringify(samView)).not.toContain('a1');

    const both = applyPledge(one, 'sam', { amount: 400, sourceAccountId: 's1' }, pass);
    const after = viewFor(both, 'sam');
    expect(both.phase).toBe('revealed');
    expect(after.participants.find((p) => p.memberId === 'alex')?.pledge).toBe(300);
    expect(after.shortfall).toBe(300);
    expect(JSON.stringify(after.participants)).not.toContain('a1');
  });

  it('an invited friend must accept before they count; declining removes them', () => {
    const h = huddle([newParticipant('alex', 'u1', 'Alex'), newParticipant('sam', 'u2', 'Sam', { joined: false })]);
    expect(applyInviteAnswer(h, 'sam', true).participants.find((p) => p.memberId === 'sam')?.joined).toBe(true);
    expect(applyInviteAnswer(h, 'sam', false).participants.map((p) => p.memberId)).toEqual(['alex']);
  });

  it('a decline gives a neutral group message with no financial details', () => {
    const pass = { passed: true, scoreBefore: 90, scoreAfter: 88, reason: 'ok' };
    const h = applyPledge(huddle(), 'alex', { amount: 100, sourceAccountId: 'a1' }, pass);
    const d = applyDecline(h, 'alex', 'unfairSplit', { alex: 100 });
    expect(d.message).toBe('Alex requested changes: the split feels unfair.');
    expect(viewFor(d, 'alex').fairSplit).toEqual([{ memberId: 'alex', name: 'Alex', amount: 100 }]);
    expect(d.round).toBe(2);
  });
});
