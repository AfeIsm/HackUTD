// The agent loop: Nemotron plans, calls our engine tools, and finishes with propose_plan.
// Guardrails: max 6 model turns, 45s total, temperature 0. The final plan is RE-SCORED by the
// engine on the server, so whatever the model claims, the numbers shown are the engine's.

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentStep, FinancialPicture, Status } from '../types';
import { money0 } from '../format';
import { NEMOTRON_MODEL, nemotron } from './client';
import { TOOLS, afford, engineFixPlan, overview, runScenario, spending, type ScenarioInput } from './tools';

export interface AgentPlan {
  summary: string;
  explanation: string;
  actions: string[];
  scoreBefore: number | null;
  scoreAfter: number | null;
  statusBefore: Status;
  statusAfter: Status;
  notGreen: string[];
  problems: string[];
}

export interface AgentAnswer {
  question: string;
  steps: AgentStep[];
  plan: AgentPlan | null;
  message: string | null; // a plain answer when no plan was needed, or why it stopped early
  model: string;
  cached: boolean;
}

const MAX_TURNS = 8;
const TIME_LIMIT_MS = 45_000;

const SYSTEM = (asOf: string) => `You are Wallet Whisperer's money coach, working for ONE user on their own data. Today is ${asOf}.
How you work:
1. Call get_overview first. Call get_spending if the question involves spending, subscriptions or cutting back.
2. Turn the user's goal and constraints into concrete options, and test 2-3 of them with simulate (or can_afford for a purchase). Respect what the user said they will NOT give up.
3. Always call simulate (or can_afford) at least once yourself before finishing, even if you also asked get_engine_fix_plan.
   If can_afford says no, try options with simulate: weeklySavings until the date, cancelling non-essential subscriptions, or paying from the savings account, combined with the same purchase.
4. ALWAYS finish by calling propose_plan with the best option you simulated (fewest changes that meets the goal, ideally a green score). If nothing works, still call propose_plan with no actions and say plainly that it isn't affordable yet. Never end with plain text.
Rules: never invent or calculate a number yourself. In summary and explanation write NO numbers or dollar amounts at all: the app shows the engine's verified numbers next to your words. Use account ids and subscription keys exactly as tools give them. No investment or stock advice. Keep explanations short and plain.`;

// The model must not state numbers (AGENTS.md: never compute money with the AI). Any sentence
// in its prose that contains a digit is dropped; the engine's numbers are shown separately.
const noNumbers = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => !/\d/.test(x)).join(' ').trim();

const stripThinking = (s: string | null | undefined) => (s ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

/** Short, human description of a tool call + its result, written by us (not the model). */
function describe(name: string, args: Record<string, unknown>, result: unknown): string {
  const r = result as Record<string, unknown>;
  if (name === 'get_overview') return `Read your accounts: score ${r.score} (${r.status}), income ${r.monthlyIncome}/mo.`;
  if (name === 'get_spending') return `Looked at the last ${r.days} days of spending (${r.totalSpent}) and your recurring bills.`;
  if (name === 'can_afford') return `Checked if you can afford ${money0(Math.round(Number(args.amount) * 100))}: ${r.verdict}${r.readyDate ? ` (OK after ${r.readyDate})` : ''}, score ${r.scoreBefore} → ${r.scoreAfter}.`;
  if (name === 'get_engine_fix_plan') return `Asked the scoring engine for its smallest fix: ${r.summary}`;
  if (name === 'simulate') {
    const s = result as ReturnType<typeof runScenario>;
    if (!s.ok) return `Tried an option that didn't work: ${s.error}`;
    return `Simulated ${s.actions.join(' + ') || 'no changes'} → score ${s.before.score} → ${s.after?.score} (${s.after?.status}).`;
  }
  return name;
}

function parseArgs(raw: string): Record<string, unknown> {
  try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export async function runAgent(picture: FinancialPicture, question: string, asOf: string, onStep: (s: AgentStep) => void): Promise<AgentAnswer> {
  const started = Date.now();
  const steps: AgentStep[] = [];
  const push = (s: AgentStep) => { steps.push(s); onStep(s); };
  const done = (plan: AgentPlan | null, message: string | null): AgentAnswer => ({ question, steps, plan, message, model: NEMOTRON_MODEL, cached: false });
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM(asOf) }, { role: 'user', content: question }];

  push({ type: 'plan', text: 'Nemotron is reading your question and planning which checks to run.' });
  let nudged = false;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (Date.now() - started > TIME_LIMIT_MS) break;
    // Last turn (or out of time soon): it MUST propose, so a run always ends in a scored plan.
    const last = turn === MAX_TURNS - 1 || Date.now() - started > TIME_LIMIT_MS - 12_000;
    const res = await nemotron().chat.completions.create({
      model: NEMOTRON_MODEL, messages, tools: TOOLS, temperature: 0, max_tokens: 900,
      tool_choice: last ? { type: 'function', function: { name: 'propose_plan' } } : 'auto',
    });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
    if (!calls.length) {
      if (!nudged) { // it must finish with a re-scorable plan, not prose
        nudged = true;
        messages.push({ role: 'assistant', content: stripThinking(msg.content) || '(no answer)' });
        messages.push({ role: 'user', content: 'Finish by calling propose_plan now (with no actions if nothing you tested works).' });
        continue;
      }
      break;
    }
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const call of calls) {
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      if (name === 'propose_plan') {
        const scenario = runScenario(picture, args as ScenarioInput, asOf); // engine re-scores the final plan
        if (!scenario.ok) {
          push({ type: 'result', tool: name, text: `The proposed plan didn't check out (${scenario.error}); asking Nemotron to fix it.` });
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: scenario.error }) });
          continue;
        }
        const plan: AgentPlan = {
          summary: noNumbers(String(args.summary ?? '')) || 'Here is your plan.', explanation: noNumbers(String(args.explanation ?? '')),
          actions: scenario.actions, scoreBefore: scenario.before.score, scoreAfter: scenario.after!.score,
          statusBefore: scenario.before.status, statusAfter: scenario.after!.status, notGreen: scenario.after!.notGreen, problems: scenario.after!.problems,
        };
        push({ type: 'final', tool: name, text: `Proposed a plan, re-checked by the engine: score ${plan.scoreBefore} → ${plan.scoreAfter} (${plan.statusAfter}).` });
        return done(plan, null);
      }
      const result =
        name === 'get_overview' ? overview(picture, asOf)
        : name === 'get_spending' ? spending(picture, asOf, Number(args.days) || 30)
        : name === 'simulate' ? runScenario(picture, args as ScenarioInput, asOf)
        : name === 'can_afford' ? afford(picture, args as { amount: number; date?: string; accountId: string; label?: string }, asOf)
        : name === 'get_engine_fix_plan' ? engineFixPlan(picture, asOf)
        : { error: `Unknown tool ${name}` };
      push({ type: 'tool', tool: name, text: describe(name, args, result) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  const fallback = engineFixPlan(picture, asOf);
  push({ type: 'final', text: 'Nemotron didn’t finish with a plan, so here is the scoring engine’s own plan instead.' });
  return done(null, `The engine's plan: ${fallback.summary}`);
}
