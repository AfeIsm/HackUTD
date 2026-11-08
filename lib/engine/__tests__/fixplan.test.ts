import { describe, expect, it } from 'vitest';
import fixture from '../../nessie/local.json';
import { toPicture } from '../../nessie/picture';
import { DEMO_ASOF, PEOPLE } from '../../people';
import { buildFixPlan, monthlyLeftover } from '../fixplan';
import { scoreHealth } from '../health';
import { freeSavings } from '../source';
import type { FinancialPicture } from '../../types';

type Fixture = { members: Record<string, Parameters<typeof toPicture>[0]>; merchants: Parameters<typeof toPicture>[2] };
const seed = (id: string): FinancialPicture =>
  toPicture((fixture as unknown as Fixture).members[id], PEOPLE.find((p) => p.id === id)!, (fixture as unknown as Fixture).merchants, DEMO_ASOF);

describe('buildFixPlan (seed data)', () => {
  it('gets Alex (60 yellow) to green with a small transfer, not useless subscription cuts', () => {
    const alex = seed('alex');
    const plan = buildFixPlan(alex, DEMO_ASOF)!;
    process.stderr.write(`\nALEX ${JSON.stringify({ summary: plan.summary, steps: plan.steps.map((s) => [s.label, s.detail]), still: plan.stillNotGreen }, null, 1)}\n`);
    expect(plan.scoreBefore).toBe(60);
    expect(plan.statusAfter).toBe('green');
    const move = plan.steps.find((s) => s.kind === 'move')!;
    expect(move).toBeDefined();
    expect(move.amount).toBeLessThanOrEqual(freeSavings(alex, move.fromAccountId)); // never touches the Orlando goal
    expect(plan.steps.some((s) => s.kind === 'cancel')).toBe(false); // cuts don't help Alex, so none are suggested
    const save = plan.steps.find((s) => s.kind === 'save');
    process.stderr.write(`\nALEX leftover/mo ${monthlyLeftover(alex, DEMO_ASOF)} save ${save?.amount}\n`);
    if (save) expect(save.amount * 52 / 12).toBeLessThanOrEqual(monthlyLeftover(alex, DEMO_ASOF)); // realistic
  });

  it('every claimed score is what scoreHealth really gives', () => {
    const alex = seed('alex');
    const plan = buildFixPlan(alex, DEMO_ASOF)!;
    const move = plan.steps.find((s) => s.kind === 'move')!;
    const moved = { ...alex, accounts: alex.accounts.map((a) => a.id === move.fromAccountId ? { ...a, balance: a.balance - move.amount } : a.id === move.toAccountId ? { ...a, balance: a.balance + move.amount } : a) };
    expect(scoreHealth(moved, { asOf: DEMO_ASOF, changes: plan.changes }).score).toBe(plan.scoreAfter);
  });

  it('is deterministic', () => {
    expect(buildFixPlan(seed('alex'), DEMO_ASOF)).toEqual(buildFixPlan(seed('alex'), DEMO_ASOF));
  });

  it('already-green people get optional improvements or "nothing to fix", never a worse score', () => {
    for (const id of ['jordan', 'sam']) {
      const plan = buildFixPlan(seed(id), DEMO_ASOF)!;
      process.stderr.write(`\n${id.toUpperCase()} ${plan.summary} | ${plan.steps.map((s) => s.label).join('; ')}\n`);
      expect(plan.statusBefore).toBe('green');
      expect(plan.scoreAfter!).toBeGreaterThanOrEqual(plan.scoreBefore!);
    }
  });
});
