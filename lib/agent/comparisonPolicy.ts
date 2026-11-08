import type { BuyScenario } from './buyScenarios';

export interface ComparisonRecommendation {
  id: BuyScenario['id'] | null;
  why: string;
  source: 'nemotron' | 'engine';
}

export function canRecommend(scenario: BuyScenario): boolean {
  if (scenario.id === 'skip') return !!scenario.baseline && scenario.baseline.score !== null
    && scenario.baseline.missingInputs.length === 0 && scenario.points.length > 1 && !scenario.unavailable;
  const r = scenario.result;
  return !!scenario.question && !!r && r.verdict === 'yes' && r.after.overall === 'green' && r.liquid && r.scoreAfter !== null
    && r.missingInputs.length === 0 && r.flags.length === 0;
}

export function engineRecommendation(scenarios: BuyScenario[]): ComparisonRecommendation {
  const best = scenarios.find((s) => s.id === 'now' && canRecommend(s))
    ?? scenarios.find((s) => s.id === 'payday' && canRecommend(s))
    ?? scenarios.find((s) => s.id === 'skip' && canRecommend(s));
  return { id: best?.id ?? null, source: 'engine', why: best?.id === 'skip'
    ? 'Keeps your money available for bills and savings without adding new purchases.'
    : best ? 'Covers the planned purchases and projected bills while protecting your savings goals.'
    : 'More account details are needed before making a recommendation.' };
}

export function checkedRecommendation(args: Record<string, unknown>, scenarios: BuyScenario[]): ComparisonRecommendation | null {
  const safe = scenarios.filter(canRecommend);
  const id = args.id === 'none' ? null : args.id;
  if (id === null ? safe.length > 0 : !safe.some((s) => s.id === id)) return null;
  const why = typeof args.why === 'string' ? args.why.trim() : '';
  if (!why || why.split(/\s+/).length > 20 || /[\d$€£<>]/.test(why) || why.length > 180) return null;
  return { id: id as BuyScenario['id'] | null, why, source: 'nemotron' };
}
