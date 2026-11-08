import type { BuyScenario } from './buyScenarios';

export interface ComparisonRecommendation {
  id: BuyScenario['id'] | null;
  why: string;
  source: 'nemotron' | 'engine';
}

export function canRecommend(scenario: BuyScenario): boolean {
  const r = scenario.result;
  return !!scenario.question && !!r && r.verdict === 'yes' && r.after.overall === 'green' && r.liquid && r.scoreAfter !== null
    && r.missingInputs.length === 0 && r.flags.length === 0 && !scenario.offer?.unknownCosts.length;
}

export function engineRecommendation(scenarios: BuyScenario[]): ComparisonRecommendation {
  const best = scenarios.filter(canRecommend).sort((a, b) =>
    b.result!.scoreAfter! - a.result!.scoreAfter!
    || (b.lowest?.balance ?? -Infinity) - (a.lowest?.balance ?? -Infinity)
    || a.question!.cost - b.question!.cost)[0];
  return { id: best?.id ?? null, source: 'engine', why: best ? 'Keeps projected bills covered and protects your savings goals.' : 'None of these options clears the full bill, savings and price checks yet.' };
}

export function checkedRecommendation(args: Record<string, unknown>, scenarios: BuyScenario[]): ComparisonRecommendation | null {
  const safe = scenarios.filter(canRecommend);
  const id = args.id === 'none' ? null : args.id;
  if (id === null ? safe.length > 0 : !safe.some((s) => s.id === id)) return null;
  const why = typeof args.why === 'string' ? args.why.trim() : '';
  if (!why || why.split(/\s+/).length > 20 || /[\d$€£<>]/.test(why) || why.length > 180) return null;
  return { id: id as BuyScenario['id'] | null, why, source: 'nemotron' };
}
