import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScenarioChart } from './ScenarioChart';
import { buildBuyScenarios } from './buyScenarios';
import { alex, ASOF } from '../lib/engine/__tests__/fixtures';
const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const question = { label: 'Console', cost: 90000, date: ASOF, sourceAccountId: 'a1' };
describe('combined scenario chart', () => {
  it('draws every available scenario and announces their exact same-day balances', () => {
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios: buildBuyScenarios(picture, question, ASOF) }));
    expect(html).toContain('data-scenario="now"');
    expect(html).toContain('data-scenario="payday"');
    expect(html).toContain('data-scenario="skip"');
    expect(html).toContain('Buy now -$100.00; Wait for payday $800.00; Don&#x27;t buy it $800.00');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('shows the no-purchase series even when no later payday reaches the selected account', () => {
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios: buildBuyScenarios(picture, { ...question, sourceAccountId: 'a2', goalId: 'orlando', cost: 18000 }, ASOF) }));
    expect(html).toContain('data-scenario="skip"');
    expect(html).not.toContain('data-scenario="payday"');
    expect(html).not.toContain('Buy cheaper');
    expect(html).toContain('Don&#x27;t buy it $900.00');
    expect(html).toContain('unavailable');
  });
  it('does not invent forecast values when the account details are incomplete', () => {
    const scenarios = buildBuyScenarios({ ...picture, paycheck: null }, question, ASOF);
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios }));
    expect(html).not.toContain('<svg');
    expect(html).toContain('missing account details');
  });
  it('marks every planned purchase date while comparing the combined plan', () => {
    const purchases = [
      { ...question, label: 'Headphones', cost: 10000 },
      { ...question, label: 'Concert tickets', cost: 12000, date: '2026-11-21' },
    ];
    const html = renderToStaticMarkup(createElement(ScenarioChart, { scenarios: buildBuyScenarios(picture, purchases, ASOF) }));
    expect(html).toContain(`data-purchase-date="${ASOF}"`);
    expect(html).toContain('data-purchase-date="2026-11-21"');
    expect(html).toContain('Headphones');
    expect(html).toContain('Concert tickets');
    expect(html).toContain('Jump to a planned purchase date');
    expect(html).toContain('Buy all as planned $700.00; Wait for payday $800.00; Don&#x27;t buy any $800.00');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
