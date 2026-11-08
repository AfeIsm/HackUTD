import { expect, it } from 'vitest';
import { alex, ASOF } from '../../engine/__tests__/fixtures';
import { buildBuyScenarios } from '../buyScenarios';
import { recommendComparison } from '../comparisonAgent';

it.skipIf(process.env.RUN_NEMOTRON_LIVE !== '1')('live Nemotron inspects scenarios and recommends the verified payday option', async () => {
  const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
  const scenarios = buildBuyScenarios(picture, { label: 'Console', cost: 90000, sourceAccountId: 'a1', date: ASOF }, [], ASOF);
  const tools: string[] = [];
  const result = await recommendComparison(scenarios, (step) => { if (step.tool) tools.push(step.tool); });
  expect(result.source).toBe('nemotron');
  expect(result.id).toBe('payday');
  expect(result.why.split(/\s+/).length).toBeLessThanOrEqual(20);
  expect(tools).toEqual(['inspect_scenarios', 'recommend_scenario']);
}, 55000);
