import { createHash } from 'node:crypto';
import type { AgentStep, FinancialPicture } from '../types';
import { dataHash } from '../engine/hash';
import { DEMO_ASOF } from '../people';
import { buildBuyScenarios, type BuyScenario } from './buyScenarios';
import type { BuyQuestion } from './buyOptions';
import { recommendComparison } from './comparisonAgent';
import type { ComparisonRecommendation } from './comparisonPolicy';

export type ComparisonEvent =
  | { type: 'step'; step: AgentStep }
  | { type: 'scenarios'; scenarios: BuyScenario[] }
  | { type: 'done'; recommendation: ComparisonRecommendation; searchMessage: string | null }
  | { type: 'error'; error: string };

const cache = new Map<string, { events: ComparisonEvent[]; expires: number }>();
const active = new Map<string, { events: ComparisonEvent[]; listeners: Set<(event: ComparisonEvent) => void>; done: Promise<void> }>();
const runs = new Map<string, number[]>();
export function comparisonId(memberId: string, picture: FinancialPicture, purchase: BuyQuestion | BuyQuestion[]): string {
  const purchases = Array.isArray(purchase) ? purchase : [purchase];
  const hash = createHash('sha256').update(JSON.stringify([memberId, dataHash(picture), purchases.map((item) => [item.label, item.cost, item.date, item.sourceAccountId, item.goalId ?? ''])])).digest('hex');
  return `purchase-basket-v1:${hash}`;
}
export function comparisonCached(id: string) { return (cache.get(id)?.expires ?? 0) > Date.now() || active.has(id); }
export function reserveComparisonRun(memberId: string): boolean {
  const recent = (runs.get(memberId) ?? []).filter((time) => time > Date.now() - 600_000);
  if (recent.length >= 8) return false;
  if (runs.size > 500) runs.delete(runs.keys().next().value!);
  runs.set(memberId, [...recent, Date.now()]);
  return true;
}

/** A bounded cache and single flight keep popup reopening from repeating a paid agent run. */
export async function runComparison(memberId: string, picture: FinancialPicture, purchase: BuyQuestion | BuyQuestion[], send: (event: ComparisonEvent) => void): Promise<void> {
  const id = comparisonId(memberId, picture, purchase);
  const saved = cache.get(id);
  if (saved && saved.expires > Date.now()) { saved.events.forEach(send); return; }
  const existing = active.get(id);
  if (existing) { existing.events.forEach(send); existing.listeners.add(send); try { await existing.done; } finally { existing.listeners.delete(send); } return; }
  const entry = { events: [] as ComparisonEvent[], listeners: new Set([send]), done: Promise.resolve() };
  const emit = (event: ComparisonEvent) => { entry.events.push(event); entry.listeners.forEach((listener) => listener(event)); };
  entry.done = Promise.resolve().then(async () => {
    try {
      const scenarios = buildBuyScenarios(picture, purchase, DEMO_ASOF);
      emit({ type: 'scenarios', scenarios });
      emit({ type: 'step', step: { type: 'plan', text: 'Checking the combined effect of buying as planned, waiting for payday or keeping your money.' } });
      const recommendation = await recommendComparison(scenarios, (step) => emit({ type: 'step', step }));
      emit({ type: 'done', recommendation, searchMessage: null });
      if (recommendation.source === 'nemotron') {
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(id, { events: entry.events, expires: Date.now() + 3_600_000 });
      }
    } catch { emit({ type: 'error', error: 'The comparison couldn’t finish. You can try again.' }); }
    finally { active.delete(id); entry.listeners.clear(); }
  });
  active.set(id, entry);
  await entry.done;
}
