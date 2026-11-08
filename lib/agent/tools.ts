// The ONLY things Nemotron can do. Every tool runs our engine on the logged-in member's own
// picture (the route passes it in; nobody else's data is reachable). The model picks tools and
// writes the explanation; every money number comes back from here, never from the model.

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Change, FinancialPicture, HealthResult, Status } from '../types';
import { canAfford } from '../engine/afford';
import { addDays, daysBetween } from '../engine/dates';
import { buildFixPlan, monthlyLeftover } from '../engine/fixplan';
import { monthly, scoreHealth } from '../engine/health';
import { toCents } from '../engine/money';
import { freeSavings } from '../engine/source';
import { validDate } from '../engine/validation';
import { money0, shortDate } from '../format';

export interface ScenarioInput {
  cancel?: string[]; // obligation keys (non-essential only)
  moveSavingsToChecking?: number; // dollars, one-time, today
  weeklySavings?: number; // dollars per week, checking → savings
  purchase?: { amount: number; date?: string; accountId: string; label?: string }; // dollars
}

export interface ScenarioResult {
  ok: boolean;
  error?: string;
  actions: string[]; // human labels of what was applied
  before: { score: number | null; status: Status };
  after?: { score: number | null; status: Status; notGreen: string[]; flags: string[]; problems: string[] };
}

const brief = (r: HealthResult) => ({ score: r.score, status: r.overall });

/** Apply a what-if to the member's picture and score it with the real engine. */
export function runScenario(p: FinancialPicture, input: ScenarioInput, asOf: string): ScenarioResult {
  const before = scoreHealth(p, { asOf });
  const actions: string[] = [];
  const fail = (error: string): ScenarioResult => ({ ok: false, error, actions, before: brief(before) });
  const owned = p.accounts.filter((a) => a.ownerMemberId === p.memberId);
  const checking = owned.find((a) => a.type === 'Checking');
  const savings = owned.filter((a) => a.type === 'Savings').sort((x, y) => freeSavings(p, y.id) - freeSavings(p, x.id))[0];
  const changes: Change[] = [];
  let picture = p;
  let days = 30;

  for (const key of input.cancel ?? []) {
    const o = p.obligations.find((x) => x.key === key);
    if (!o) return fail(`Unknown bill or subscription "${key}". Use a key from get_spending.`);
    if (o.essential) return fail(`${o.name} is an essential bill and can't be cancelled in a plan.`);
    changes.push({ kind: 'cancelObligation', amount: 0, obligationKey: key, date: asOf, label: `Cancel ${o.name}` });
    actions.push(`Cancel ${o.name} (saves ${money0(monthly(o))}/mo)`);
  }
  if (input.moveSavingsToChecking) {
    const cents = toCents(input.moveSavingsToChecking);
    if (!savings || !checking) return fail('A checking and a savings account are both needed to move money.');
    const free = freeSavings(p, savings.id);
    if (!Number.isSafeInteger(cents) || cents <= 0) return fail('Move amount must be positive.');
    if (cents > free) return fail(`Only ${money0(free)} of savings is free (the rest is set aside for goals).`);
    picture = { ...picture, accounts: picture.accounts.map((a) => a.id === savings.id ? { ...a, balance: a.balance - cents } : a.id === checking.id ? { ...a, balance: a.balance + cents } : a) };
    actions.push(`Move ${money0(cents)} from ${savings.nickname} to ${checking.nickname}`);
  }
  if (input.weeklySavings) {
    const cents = toCents(input.weeklySavings);
    if (!savings || !checking) return fail('A checking and a savings account are both needed to save weekly.');
    if (!Number.isSafeInteger(cents) || cents <= 0) return fail('Weekly savings must be positive.');
    changes.push({ kind: 'weekly', amount: cents, sourceAccountId: checking.id, destinationAccountId: savings.id, label: 'Weekly savings' });
    actions.push(`Save ${money0(cents)} a week`);
  }
  if (input.purchase) {
    const cents = toCents(input.purchase.amount);
    const date = input.purchase.date ?? asOf;
    if (!Number.isSafeInteger(cents) || cents <= 0) return fail('Purchase amount must be positive.');
    if (!validDate(date) || date < asOf || daysBetween(asOf, date) > 335) return fail(`Purchase date must be between ${asOf} and ${addDays(asOf, 335)}.`);
    if (!owned.some((a) => a.id === input.purchase!.accountId && a.type !== 'Credit Card')) return fail('Pay from one of your checking or savings account ids (see get_overview).');
    changes.push({ kind: 'oneTime', amount: cents, sourceAccountId: input.purchase.accountId, date, label: input.purchase.label ?? 'Purchase' });
    days = Math.min(365, Math.max(30, daysBetween(asOf, date) + 30));
    actions.push(`${input.purchase.label ?? 'Purchase'}: ${money0(cents)} on ${shortDate(date)}`);
  }

  const after = scoreHealth(picture, { asOf, changes, days });
  return {
    ok: true, actions, before: brief(before),
    after: { ...brief(after), notGreen: after.indicators.filter((i) => i.status !== 'green').map((i) => `${i.label}: ${i.display}`), flags: after.flags, problems: after.missingInputs },
  };
}

// ---------- tool schemas (what Nemotron sees) ----------
const scenarioProps = {
  cancel: { type: 'array', items: { type: 'string' }, description: 'Keys of NON-essential subscriptions to cancel (from get_spending).' },
  moveSavingsToChecking: { type: 'number', description: 'Dollars to move once, today, from free savings to checking.' },
  weeklySavings: { type: 'number', description: 'Dollars to move from checking to savings every week.' },
  purchase: {
    type: 'object', description: 'A one-time purchase or trip the user asked about.',
    properties: { amount: { type: 'number', description: 'Dollars' }, date: { type: 'string', description: 'YYYY-MM-DD' }, accountId: { type: 'string' }, label: { type: 'string' } },
    required: ['amount', 'accountId'],
  },
} as const;

export const TOOLS: ChatCompletionTool[] = [
  { type: 'function', function: { name: 'get_overview', description: 'Current health score, the 5 indicators and why, income, real monthly leftover, accounts (with ids) and savings goals.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_spending', description: 'Spending in the last N days by category and merchant, plus every recurring bill/subscription with its key, monthly cost and whether it is essential.', parameters: { type: 'object', properties: { days: { type: 'number', description: '30 or 60' } } } } },
  { type: 'function', function: { name: 'simulate', description: 'Re-score the health check as if these changes happened. Use this to test every option before proposing it.', parameters: { type: 'object', properties: scenarioProps } } },
  { type: 'function', function: { name: 'can_afford', description: 'Can the user afford a purchase from one account on a date? Returns yes / yes-if (with a date) / no, and the score before and after.', parameters: { type: 'object', properties: { amount: { type: 'number', description: 'Dollars' }, date: { type: 'string', description: 'YYYY-MM-DD' }, accountId: { type: 'string' }, label: { type: 'string' } }, required: ['amount', 'accountId'] } } },
  { type: 'function', function: { name: 'get_engine_fix_plan', description: 'The scoring engine’s own smallest plan to reach green (subscription cuts, a savings move, a weekly savings target).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'propose_plan', description: 'Finish: propose the final plan. The actions are re-scored by the engine, so only include actions you simulated.', parameters: { type: 'object', properties: { ...scenarioProps, summary: { type: 'string', description: 'One sentence plan headline, no numbers you did not get from a tool.' }, explanation: { type: 'string', description: '2-4 short sentences: why this plan fits what the user asked.' } }, required: ['summary', 'explanation'] } } },
];

// ---------- tool executors ----------
const PAY_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };

export function overview(p: FinancialPicture, asOf: string) {
  const r = scoreHealth(p, { asOf });
  return {
    today: asOf, score: r.score, status: r.overall,
    indicators: r.indicators.map((i) => ({ name: i.label, status: i.status, value: i.display, why: i.explanation })),
    monthlyIncome: p.paycheck ? money0(Math.round(p.paycheck.avgAmount * (PAY_MONTH[p.paycheck.cadenceDays] ?? 1))) : 'not detected',
    nextPayday: p.paycheck?.nextDate ?? null,
    monthlyLeftoverAfterRealSpending: money0(monthlyLeftover(p, asOf)),
    accounts: p.accounts.filter((a) => a.ownerMemberId === p.memberId).map((a) => ({ id: a.id, type: a.type, name: a.nickname, balance: money0(a.balance), ...(a.type === 'Savings' ? { freeToUse: money0(freeSavings(p, a.id)) } : {}) })),
    goals: p.goals.map((g) => ({ name: g.name, setAside: money0(g.amount) })),
  };
}

export function spending(p: FinancialPicture, asOf: string, days = 30) {
  const window = days === 60 ? 60 : 30;
  const since = addDays(asOf, -window);
  const spent = p.txns.filter((t) => (t.kind === 'purchase' || t.kind === 'withdrawal') && t.date > since && t.date <= asOf);
  const sum = (key: (t: (typeof spent)[number]) => string) => {
    const m = new Map<string, number>();
    for (const t of spent) m.set(key(t), (m.get(key(t)) ?? 0) + t.amount);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, cents]) => ({ name, total: money0(cents) }));
  };
  return {
    days: window, totalSpent: money0(spent.reduce((s, t) => s + t.amount, 0)),
    byCategory: sum((t) => t.category ?? 'Other'), topMerchants: sum((t) => t.merchant ?? t.description),
    recurring: p.obligations.map((o) => ({ key: o.key, name: o.name, monthly: money0(monthly(o)), essential: o.essential, kind: o.origin })),
  };
}

export function afford(p: FinancialPicture, args: { amount: number; date?: string; accountId: string; label?: string }, asOf: string) {
  const r = canAfford(p, { label: args.label ?? 'Purchase', cost: toCents(args.amount), date: args.date, sourceAccountId: args.accountId }, asOf);
  return { verdict: r.verdict, reason: r.reason, scoreBefore: r.scoreBefore, scoreAfter: r.scoreAfter, readyDate: r.readyDate ?? null, flags: r.flags };
}

export function engineFixPlan(p: FinancialPicture, asOf: string) {
  const plan = buildFixPlan(p, asOf);
  return plan ? { summary: plan.summary, steps: plan.steps.map((s) => `${s.label}: ${s.detail}`), scoreBefore: plan.scoreBefore, scoreAfter: plan.scoreAfter, stillNotGreen: plan.stillNotGreen } : { summary: 'Needs more data before a plan can be built.' };
}
