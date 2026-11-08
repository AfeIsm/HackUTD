// The whole Orlando demo story, run through the real huddle code + engine + Nessie seed data.
import { describe, expect, it } from 'vitest';
import { checkPledge } from '../engine/split';
import { agree, getHuddleState, publicParticipants, respondToInvite, submitPledge } from '../huddles';
import { local } from '../nessie/client';
import { toPicture } from '../nessie/picture';
import { DEMO_ASOF, getPerson } from '../people';

const pic = (id: string) => toPicture(local.members[id], getPerson(id), local.merchants, DEMO_ASOF);
const orlando = () => getHuddleState().huddles.find((h) => h.id === 'orlando')!;
const TRIP = '2027-03-20';

describe('Orlando huddle, start to lock', () => {
  it('starts in pledging with 2 of 4 payers committed and amounts hidden from the group', () => {
    expect(orlando().phase).toBe('pledging');
    const pub = publicParticipants(orlando());
    expect(pub.every((p) => p.pledge === null)).toBe(true); // privacy: no amounts before reveal
  });

  it('Alex pledges $900 from emergency savings → fails privately; group only sees "not committed"', () => {
    const pledge = { amount: 900, source: 'savings' as const };
    submitPledge('orlando', 'alex', pledge, checkPledge(pic('alex'), pledge, TRIP, DEMO_ASOF));
    const alex = orlando().participants.find((p) => p.memberId === 'alex')!;
    expect(alex.committed).toBe(false);
    expect(alex.feedback).toContain('emergency savings');
    expect(alex.suggestion?.amount).toBe(900);
    const pubAlex = publicParticipants(orlando()).find((p) => p.memberId === 'alex')!;
    expect(pubAlex).toMatchObject({ committed: false, pledge: null });
    expect(JSON.stringify(publicParticipants(orlando()))).not.toContain('emergency'); // no private feedback leaks
  });

  it('Alex takes the suggestion ($900 from checking) → committed', () => {
    const pledge = { amount: 900, source: 'checking' as const };
    submitPledge('orlando', 'alex', pledge, checkPledge(pic('alex'), pledge, TRIP, DEMO_ASOF));
    expect(orlando().participants.find((p) => p.memberId === 'alex')!.committed).toBe(true);
    expect(orlando().phase).toBe('pledging'); // Sam hasn't joined yet
  });

  it('Sam accepts the invite and pledges $800 → revealed, $400 short, amounts now visible', () => {
    const invite = getHuddleState().invites.find((i) => i.toId === 'sam' && i.huddleId === 'orlando')!;
    respondToInvite(invite.id, true);
    const pledge = { amount: 800, source: 'checking' as const };
    submitPledge('orlando', 'sam', pledge, checkPledge(pic('sam'), pledge, TRIP, DEMO_ASOF));
    expect(orlando().phase).toBe('revealed');
    const pub = publicParticipants(orlando());
    expect(pub.find((p) => p.memberId === 'jordan')!.pledge).toBe(1800);
    expect(pub.reduce((s, p) => s + (p.pledge ?? 0), 0)).toBe(3600);
  });

  it('Alex raises to $1,300 → fully funded → agreeing', () => {
    const pledge = { amount: 1300, source: 'checking' as const };
    submitPledge('orlando', 'alex', pledge, checkPledge(pic('alex'), pledge, TRIP, DEMO_ASOF));
    expect(orlando().phase).toBe('agreeing');
  });

  it('everyone agrees → locked', () => {
    for (const id of ['alex', 'jordan', 'maya']) agree('orlando', id);
    expect(orlando().phase).toBe('agreeing');
    agree('orlando', 'sam');
    expect(orlando().phase).toBe('locked');
  });
});
