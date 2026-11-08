import { describe, expect, it } from 'vitest';
import { scoreHealth } from '../../engine/health';
import { DEMO_ASOF, getPerson } from '../../people';
import { local } from '../client';
import { nextDueDate, toPicture } from '../picture';

// Runs the whole pipeline on the real Nessie seed (lib/nessie/local.json):
// Nessie records → detectors → obligations → health score.
const picture = (id: string) => toPicture(local.members[id], getPerson(id), local.merchants, DEMO_ASOF);

describe('Nessie seed → FinancialPicture → score', () => {
  it('Alex: paycheck detected from deposits, 10 obligations, score 60', () => {
    const alex = picture('alex');
    expect(alex.paycheck).toMatchObject({ avgAmount: 185000, cadenceDays: 14, nextDate: '2026-11-13' });
    expect(alex.obligations.map((o) => o.name).sort()).toEqual(
      ['Car insurance', 'Car loan', 'Credit card minimum', 'Electric', 'Hulu', 'Netflix', 'Planet Fitness', 'Rent', 'Spotify', 'T-Mobile'],
    );
    expect(alex.accounts.find((a) => a.type === 'Credit Card')?.limit).toBe(200000);
    const r = scoreHealth(alex, { asOf: DEMO_ASOF });
    expect([r.score, r.overall]).toEqual([60, 'yellow']);
  });

  it('Jordan scores 85 (Healthy)', () => {
    expect(scoreHealth(picture('jordan'), { asOf: DEMO_ASOF }).score).toBe(85);
  });

  it('Sam scores 90 (Healthy)', () => {
    expect(scoreHealth(picture('sam'), { asOf: DEMO_ASOF }).score).toBe(90);
  });

  it('Maya: semi-monthly paycheck, no bills', () => {
    const maya = picture('maya');
    expect(maya.paycheck?.cadenceDays).toBe(15);
    expect(maya.obligations).toEqual([]);
  });
});

describe('nextDueDate', () => {
  it('finds the next due day on or after today', () => {
    expect(nextDueDate(20, '2026-11-07')).toBe('2026-11-20');
    expect(nextDueDate(5, '2026-11-07')).toBe('2026-12-05');
    expect(nextDueDate(31, '2026-11-07')).toBe('2026-11-30');
  });
});

describe('normalization safeguards', () => {
  it('does not use another customer’s account as an owned source', () => {
    const member = structuredClone(local.members.alex);
    member.accounts[0].customer_id = 'another-customer';
    const p = toPicture(member, getPerson('alex'), local.merchants, DEMO_ASOF);
    expect(scoreHealth(p, { asOf: DEMO_ASOF }).missingInputs.join(' ')).toContain('ownership');
  });
  it('requires settlement confirmation for pending history', () => {
    const member = structuredClone(local.members.alex);
    member.accounts[0].deposits[0].status = 'pending';
    const p = toPicture(member, getPerson('alex'), local.merchants, DEMO_ASOF);
    expect(p.missingInputs.join(' ')).toContain('settlement');
    expect(scoreHealth(p, { asOf: DEMO_ASOF }).score).toBeNull();
  });
  it('due day 31 recovers after a short month', () => {
    expect(nextDueDate(31, '2027-02-01')).toBe('2027-02-28');
    expect(nextDueDate(31, '2027-03-01')).toBe('2027-03-31');
  });
});
