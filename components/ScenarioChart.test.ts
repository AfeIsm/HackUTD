import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScenarioChart } from './ScenarioChart';
import { buildBuyScenarios } from './buyScenarios';
import { alex, ASOF } from '../lib/engine/__tests__/fixtures';
import type { Proposal } from '../lib/purchase/types';
const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const question = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
const offer: Proposal = { id: 'quote', offerKey: 'quote', title: 'Cheaper console', kind: 'product', seller: 'Retailer', link: 'https://example.com/console', linkIsSearch: false, demo: false, retrievedAt: '2026-11-08T12:00:00Z', deliveryText: null, why: '', planTotal: 40000, total: 40000, lines: [], basis: 'advertised', unknownCosts: [], tradeoffs: [], underBudgetBy: 0, belowListPriceBy: null };
describe('combined scenario chart', () => {
  it('draws every available scenario and announces their exact same-day balances', () => {
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios: buildBuyScenarios(picture, question, [offer], ASOF) }));
    expect(html).toContain('data-scenario="now"');
    expect(html).toContain('data-scenario="payday"');
    expect(html).toContain('data-scenario="cheaper"');
    expect(html).toContain('Buy now -$100.00; Wait for payday $800.00; Buy cheaper $400.00');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('does not draw a fabricated cheaper series when no live listing exists', () => {
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios: buildBuyScenarios(picture, question, [], ASOF) }));
    expect(html).not.toContain('data-scenario="cheaper"');
    expect(html).toContain('Buy cheaper');
    expect(html).toContain('unavailable');
  });
  it('does not invent forecast values when the account details are incomplete', () => {
    const scenarios = buildBuyScenarios({ ...picture, paycheck: null }, question, [], ASOF);
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios }));
    expect(html).not.toContain('<svg');
    expect(html).toContain('missing account details');
  });
});
