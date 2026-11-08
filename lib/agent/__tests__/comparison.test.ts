import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alex, ASOF } from '../../engine/__tests__/fixtures';
import { buildBuyScenarios } from '../buyScenarios';
import { canRecommend, checkedRecommendation, engineRecommendation } from '../comparisonPolicy';
const mocks = vi.hoisted(() => ({ create: vi.fn(), configured: vi.fn() }));
vi.mock('../client', () => ({ NEMOTRON_MODEL: 'test-model', agentConfigured: mocks.configured, nemotron: () => ({ chat: { completions: { create: mocks.create } } }) }));
import { recommendComparison } from '../comparisonAgent';
const picture = { ...alex, accounts: alex.accounts.map((a) => a.id === 'a1' ? { ...a, balance: 80000 } : a) };
const scenarios = () => buildBuyScenarios(picture, { label: 'Console', cost: 90000, sourceAccountId: 'a1', date: ASOF }, [], ASOF);
const reply = (name: string, args: object) => ({ choices: [{ message: { content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true); });

describe('checked comparison recommendations', () => {
  it('rejects an unsafe choice and unavailable listings even if the model requests them', () => {
    expect(checkedRecommendation({ id: 'now', why: 'Buy it now.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'cheaper', why: 'A better deal.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'payday', why: 'Waiting keeps your bills covered.' }, scenarios())).toMatchObject({ id: 'payday', source: 'nemotron' });
  });
  it('rejects invented numbers and long explanations', () => {
    expect(checkedRecommendation({ id: 'payday', why: 'Save $900 before buying.' }, scenarios())).toBeNull();
    expect(checkedRecommendation({ id: 'payday', why: 'word '.repeat(21) }, scenarios())).toBeNull();
  });
  it('can recommend none when every scenario fails', () => {
    const blocked = scenarios().map((s) => ({ ...s, result: s.result ? { ...s.result, verdict: 'no' as const } : null }));
    expect(engineRecommendation(blocked).id).toBeNull();
    expect(checkedRecommendation({ id: 'none', why: 'Protect your essential bills for now.' }, blocked)?.id).toBeNull();
    expect(checkedRecommendation({ id: 'none', why: 'No option works.' }, scenarios())).toBeNull();
  });
  it('does not recommend incomplete prices or emergency-savings use', () => {
    const safe = scenarios()[1];
    expect(canRecommend({ ...safe, result: { ...safe.result!, flags: ['This uses emergency savings.'] } })).toBe(false);
    expect(canRecommend({ ...safe, offer: { unknownCosts: ['Shipping'] } as NonNullable<typeof safe.offer> })).toBe(false);
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
    expect(emit.mock.calls.map(([s]) => s.tool)).toEqual(['inspect_scenarios', 'recommend_scenario']);
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
  it('labels the engine fallback when the provider fails or is unconfigured', async () => {
    mocks.create.mockRejectedValue(new Error('Provider unavailable'));
    expect(await recommendComparison(scenarios(), vi.fn())).toMatchObject({ id: 'payday', source: 'engine' });
    mocks.configured.mockReturnValue(false);
    mocks.create.mockClear();
    expect((await recommendComparison(scenarios(), vi.fn())).source).toBe('engine');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
