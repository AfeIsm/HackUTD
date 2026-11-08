import type { AgentStep, FinancialPicture } from '../types';
import { DEMO_ASOF } from '../people';
import { buildBuyScenarios, type BuyScenario } from './buyScenarios';
import { buyAnswerId, runBuyOptions, savedBuyAnswer, type BuyQuestion, type BuyResult } from './buyOptions';
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
export function comparisonCached(id: string) { return (cache.get(id)?.expires ?? 0) > Date.now() || active.has(id); }
export function reserveComparisonRun(memberId: string): boolean {
  const recent = (runs.get(memberId) ?? []).filter((time) => time > Date.now() - 600_000);
  if (recent.length >= 8) return false;
  if (runs.size > 500) runs.delete(runs.keys().next().value!);
  runs.set(memberId, [...recent, Date.now()]);
  return true;
}

/** A bounded cache and single flight keep popup reopening from repeating a paid agent run. */
export async function runComparison(memberId: string, picture: FinancialPicture, purchase: BuyQuestion, send: (event: ComparisonEvent) => void): Promise<void> {
  const id = buyAnswerId(memberId, picture, purchase);
  const saved = cache.get(id);
  if (saved && saved.expires > Date.now()) { saved.events.forEach(send); return; }
  const existing = active.get(id);
  if (existing) { existing.events.forEach(send); existing.listeners.add(send); try { await existing.done; } finally { existing.listeners.delete(send); } return; }
  const entry = { events: [] as ComparisonEvent[], listeners: new Set([send]), done: Promise.resolve() };
  const emit = (event: ComparisonEvent) => { entry.events.push(event); entry.listeners.forEach((listener) => listener(event)); };
  entry.done = Promise.resolve().then(async () => {
    try {
      emit({ type: 'scenarios', scenarios: buildBuyScenarios(picture, purchase, [], DEMO_ASOF) });
      emit({ type: 'step', step: { type: 'plan', text: 'Checking purchase timing, searching for alternatives and comparing financial impact.' } });
      const savedSearch = await savedBuyAnswer(id).catch(() => null);
      let search: BuyResult | null = savedSearch?.result ?? null;
      let searchMessage: string | null = null;
      if (!search) await runBuyOptions(memberId, id, picture, purchase, (event) => {
        if (event.type === 'step') emit(event);
        if (event.type === 'done') search = event.result;
        if (event.type === 'error') searchMessage = event.error;
      }).catch(() => { if (!search) searchMessage = 'Live listings could not be checked. The available scenarios are still verified by the engine.'; });
      const found = search as BuyResult | null;
      const scenarios = buildBuyScenarios(picture, purchase, found?.proposals ?? [], DEMO_ASOF);
      emit({ type: 'scenarios', scenarios });
      const recommendation = await recommendComparison(scenarios, (step) => emit({ type: 'step', step }));
      emit({ type: 'done', recommendation, searchMessage: searchMessage ?? found?.noSolution ?? null });
      if (recommendation.source === 'nemotron' && found && !found.usedDemo && !found.noSolution && !searchMessage) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(id, { events: entry.events, expires: Date.now() + 3_600_000 });
      }
    } catch { emit({ type: 'error', error: 'The comparison couldn’t finish. You can try again.' }); }
    finally { active.delete(id); entry.listeners.clear(); }
  });
  active.set(id, entry);
  await entry.done;
}
