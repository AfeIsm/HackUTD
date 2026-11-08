import { describe, expect, it } from 'vitest';
import fixture from '../../nessie/local.json';
import { toPicture } from '../../nessie/picture';
import { DEMO_ASOF, PEOPLE } from '../../people';
import { freeSavings } from '../../engine/source';
import { scoreHealth } from '../../engine/health';
import { runScenario } from '../tools';
import { questionKey } from '../saved';
import type { FinancialPicture } from '../../types';

type Fixture = { members: Record<string, Parameters<typeof toPicture>[0]>; merchants: Parameters<typeof toPicture>[2] };
const alex = (): FinancialPicture => toPicture((fixture as unknown as Fixture).members.alex, PEOPLE.find((p) => p.id === 'alex')!, (fixture as unknown as Fixture).merchants, DEMO_ASOF);

describe('agent tools: the AI can only do what the engine allows', () => {
  it('refuses to cancel an essential bill', () => {
    const p = alex();
    const rent = p.obligations.find((o) => o.essential)!;
    const r = runScenario(p, { cancel: [rent.key] }, DEMO_ASOF);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/essential/);
  });

  it('never moves goal money (only free savings)', () => {
    const p = alex();
    const savings = p.accounts.find((a) => a.type === 'Savings')!;
    const r = runScenario(p, { moveSavingsToChecking: (freeSavings(p, savings.id) + 100) / 100 }, DEMO_ASOF);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/free/);
  });

  it('rejects made-up keys and other people’s accounts', () => {
    const p = alex();
    expect(runScenario(p, { cancel: ['not-a-real-key'] }, DEMO_ASOF).ok).toBe(false);
    expect(runScenario(p, { purchase: { amount: 10, accountId: 'someone-elses-account' } }, DEMO_ASOF).ok).toBe(false);
  });

  it('scores exactly like the engine', () => {
    const p = alex();
    expect(runScenario(p, {}, DEMO_ASOF).after?.score).toBe(scoreHealth(p, { asOf: DEMO_ASOF }).score);
  });

  it('saved answers match the same question regardless of spacing/case', () => {
    expect(questionKey('  Get me to GREEN ')).toBe(questionKey('get me   to green'));
    expect(questionKey('get me to green')).not.toBe(questionKey('get me to yellow'));
  });
});
