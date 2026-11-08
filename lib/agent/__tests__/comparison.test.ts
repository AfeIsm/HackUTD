import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alex, ASOF, lowEssentials } from '../../engine/__tests__/fixtures';
import { buildBuyScenarios } from '../buyScenarios';
import { canRecommend, checkedRecommendation, engineRecommendation } from '../comparisonPolicy';
const mocks = vi.hoisted(() => ({ create: vi.fn(), configured: vi.fn() }));
vi.mock('../client', () => ({ NEMOTRON_MODEL: 'test-model', agentConfigured: mocks.configured, nemotron: () => ({ chat: { completions: { create: mocks.create } } }) }));
import { recommendComparison } from '../comparisonAgent';
const picture = lowEssentials({ ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) });
const question = { label: 'Console', cost: 90000, sourceAccountId: 'a1', date: ASOF };
const scenarios = () => buildBuyScenarios(picture, question, ASOF);
const reply = (name: string, args: object) => ({ choices: [{ message: { content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true); });

describe('checked comparison recommendations', () => {
  it('rejects unsafe purchases and the removed cheaper option while accepting eligible alternatives', () => {
    expect(checkedRecommendation({ id: 'now', why: 'Buy it now.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'cheaper', why: 'A better deal.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'payday', why: 'Waiting keeps your bills covered.' }, scenarios())).toMatchObject({ id: 'payday', source: 'nemotron' });
    expect(checkedRecommendation({ id: 'skip', why: 'Keep the money available for your priorities.' }, scenarios())).toMatchObject({ id: 'skip', source: 'nemotron' });
  });
  it('rejects invented numbers and long explanations', () => {
    expect(checkedRecommendation({ id: 'payday', why: 'Save $900 before buying.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'payday', why: 'word '.repeat(21) }, scenarios())).toBeNull();
  });
  it('can recommend none when every scenario fails', () => {
    const blocked = scenarios().map((s) => ({ ...s, result: s.result ? { ...s.result, verdict: 'no' as const } : null, baseline: null, points: [] }));
    expect(engineRecommendation(blocked).id).toBeNull();
    expect(checkedRecommendation({ id: 'none', why: 'Protect your essential bills for now.' }, blocked)?.id).toBeNull();
    expect(checkedRecommendation({ id: 'none', why: 'No option works.' }, scenarios())).toBeNull();
  });
  it('does not recommend emergency-savings use or a baseline with missing inputs', () => {
    const safe = scenarios()[1];
    expect(canRecommend({ ...safe, result: { ...safe.result!, flags: ['This uses emergency savings.'] } })).toBe(false);
    const skip = buildBuyScenarios({ ...picture, paycheck: null }, question, ASOF)[2];
    expect(canRecommend(skip)).toBe(false);
  });
  it('can recommend not buying even when the existing financial outlook is red', () => {
    const strained = { ...picture, accounts: picture.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 0 } : a) };
    const options = buildBuyScenarios(strained, question, ASOF);
    const skip = options[2];
    expect(skip.baseline?.overall).toBe('red');
    expect(canRecommend(skip)).toBe(true);
    expect(engineRecommendation(options).id).toBe('skip');
  });
  it('requires an owned valid account for the no-purchase recommendation', () => {
    const unowned = { ...picture, accounts: picture.accounts.map((a) => a.id === 'a1' ? { ...a, ownerMemberId: 'another-member' } : a) };
    expect(canRecommend(buildBuyScenarios(unowned, question, ASOF)[2])).toBe(false);
    expect(canRecommend(buildBuyScenarios(picture, { ...question, sourceAccountId: 'unknown' }, ASOF)[2])).toBe(false);
  });
  it('preserves a healthy original purchase before recommending a delay or no purchase', () => {
    const affordable = buildBuyScenarios(picture, { ...question, cost: 30000 }, ASOF);
    expect(canRecommend(affordable[0])).toBe(true);
    expect(engineRecommendation(affordable).id).toBe('now');
    expect(engineRecommendation(scenarios()).id).toBe('payday');
  });
});

describe('Nemotron comparison tool loop', () => {
  it('inspects the engine results before making a brief recommendation', async () => {
    mocks.create.mockResolvedValueOnce(reply('inspect_scenarios', {})).mockResolvedValueOnce(reply('recommend_scenario', { id: 'payday', why: 'Waiting protects your bills and gives your account more breathing room.' }));
    const emit = vi.fn();
    const result = await recommendComparison(scenarios(), emit);
    expect(result).toMatchObject({ id: 'payday', source: 'nemotron' });
    const history = mocks.create.mock.calls[1][0].messages;
    expect(history.some((m: { role: string; content: string }) => m.role === 'tool' && m.content.includes('lowestBalanceCents'))).toBe(true);
    expect(history.some((m: { role: string; content: string }) => m.role === 'tool' && m.content.includes('"id":"skip"'))).toBe(true);
    expect(emit.mock.calls.map(([s]) => s.tool)).toEqual(['inspect_scenarios', 'recommend_scenario']);
  });
  it('gives Nemotron every purchase date, the total and the combined engine results', async () => {
    const second = { ...question, label: 'Desk', cost: 20000, date: '2026-11-21' };
    const basket = buildBuyScenarios(picture, [question, second], ASOF);
    mocks.create.mockResolvedValueOnce(reply('inspect_scenarios', {}))
      .mockResolvedValueOnce(reply('recommend_scenario', { id: 'skip', why: 'Keep your money available for bills and savings.' }));
    expect((await recommendComparison(basket, vi.fn())).id).toBe('skip');
    const history = mocks.create.mock.calls[1][0].messages;
    const facts = JSON.parse(history.find((m: { role: string }) => m.role === 'tool').content);
    expect(facts[0]).toMatchObject({ totalCostCents: 110000, healthScore: basket[0].result?.scoreAfter, lowestBalanceCents: basket[0].lowest?.balance,
      purchases: [{ label: 'Console', costCents: 90000, date: ASOF }, { label: 'Desk', costCents: 20000, date: '2026-11-21' }] });
    expect(facts[1].purchases.map((item: { date: string }) => item.date)).toEqual(['2026-11-13', '2026-11-21']);
    expect(facts[2]).toMatchObject({ totalCostCents: 0, purchases: [], createsPurchase: false });
  });
  it('refuses to accept a recommendation made before inspection', async () => {
    mocks.create.mockResolvedValue(reply('recommend_scenario', { id: 'payday', why: 'Wait until payday.' }));
    expect((await recommendComparison(scenarios(), vi.fn())).source).toBe('engine');
    expect(mocks.create).toHaveBeenCalledTimes(4);
  });
  it('corrects an unsafe model choice before accepting another choice', async () => {
    mocks.create.mockResolvedValueOnce(reply('inspect_scenarios', {}))
      .mockResolvedValueOnce(reply('recommend_scenario', { id: 'now', why: 'Buy immediately.' }))
      .mockResolvedValueOnce(reply('recommend_scenario', { id: 'payday', why: 'Waiting keeps your bills covered.' }));
    expect((await recommendComparison(scenarios(), vi.fn())).id).toBe('payday');
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });
  it('rejects the removed cheaper choice and lets Nemotron recommend not buying', async () => {
    mocks.create.mockResolvedValueOnce(reply('inspect_scenarios', {}))
      .mockResolvedValueOnce(reply('recommend_scenario', { id: 'cheaper', why: 'Choose a lower price.' }))
      .mockResolvedValueOnce(reply('recommend_scenario', { id: 'skip', why: 'Keep your money available for bills and savings.' }));
    expect(await recommendComparison(scenarios(), vi.fn())).toMatchObject({ id: 'skip', source: 'nemotron' });
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });
  it('labels the engine fallback when the provider fails or is unconfigured', async () => {
    mocks.create.mockRejectedValue(new Error('Provider unavailable'));
    expect(await recommendComparison(scenarios(), vi.fn())).toMatchObject({ id: 'payday', source: 'engine' });
    mocks.configured.mockReturnValue(false);
    mocks.create.mockClear();
    expect((await recommendComparison(scenarios(), vi.fn())).source).toBe('engine');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
