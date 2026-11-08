// The answer's verdict and headline are decided HERE from the engine's numbers, never by the AI:
// Yes / Yes, if… / Not yet / Gets you to green. Plus what to focus on, and a first step.

import type { FinancialPicture, Status } from '../types';
import { buildFixPlan } from '../engine/fixplan';
import { afford, type ScenarioInput, type ScenarioResult } from './tools';
import { shortDate } from '../format';

export type Verdict = 'yes' | 'yesIf' | 'okNotGreen' | 'notYet' | 'reachesGreen' | 'improves' | 'noChange';

export interface Judgement {
  verdict: Verdict;
  headline: string;
  focus: string | null; // the indicator holding you back, and why (engine's words)
  firstStep: string | null; // what to do first when the answer isn't yes
}

// "Short-term: move $600 …" → "move $600 … first (a short-term fix that uses emergency savings)"
const lower = (s: string) => {
  const stopgap = /^short-term:\s*/i.test(s);
  const t = s.replace(/^short-term:\s*/i, '');
  return t.charAt(0).toLowerCase() + t.slice(1) + (stopgap ? ' first (a short-term fix that uses emergency savings)' : '');
};
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function judge(picture: FinancialPicture, input: ScenarioInput, s: ScenarioResult, asOf: string): Judgement {
  const after = s.after!;
  const green = after.status === 'green' && after.problems.length === 0;
  const helpers = s.actions.filter((a) => a !== s.purchaseLabel);
  const before = s.before as { score: number | null; status: Status };
  const raised = (after.score ?? 0) > (before.score ?? 0);
  const focus = after.worst ? `${after.worst.label}. ${after.worst.why}` : null;

  // When the answer isn't a clean yes: the engine's own first step toward green, or a later date.
  const engineStep = () => {
    const plan = buildFixPlan(picture, asOf);
    const scored = plan?.steps.filter((x) => x.kind !== 'save') ?? [];
    return scored.length ? `First get to green: ${list(scored.map((x) => lower(x.label)))}. Then ask again.` : plan?.steps[0] ? `${plan.steps[0].label}: ${lower(plan.steps[0].detail)}` : null;
  };

  if (input.purchase) {
    if (green) {
      return helpers.length
        ? { verdict: 'yesIf', headline: `Yes, if you ${list(helpers.map(lower))}.`, focus: null, firstStep: null }
        : { verdict: 'yes', headline: 'Yes. You can afford it and stay green.', focus: null, firstStep: null };
    }
    // The purchase itself doesn't hurt (same score, bills still covered): the money is there,
    // the person just isn't green yet. Say so, and give the first step to green.
    const billsOk = !after.notGreen.some((n) => n.startsWith('Essential bills') && n.includes('-'));
    if (billsOk && after.status === before.status && (after.score ?? 0) >= (before.score ?? 0)) {
      return {
        verdict: 'okNotGreen',
        headline: `The money is there${input.purchase.date ? ` on ${shortDate(input.purchase.date)}` : ''} and it doesn’t lower your score, but you’re ${before.status} right now, so fix that first.`,
        focus, firstStep: engineStep(),
      };
    }
    const later = afford(picture, input.purchase, asOf);
    const firstStep = later.verdict === 'yesIf' && later.readyDate
      ? `It works if you wait until ${shortDate(later.readyDate)} (after your next paycheck).`
      : engineStep();
    return { verdict: 'notYet', headline: `Not yet. It would drop your score to ${after.score} (${after.status})${helpers.length ? ', even with these changes' : ''}.`, focus, firstStep };
  }
  if (before.status === 'green') {
    return raised
      ? { verdict: 'improves', headline: `You’re already green. This makes you stronger: ${list(helpers.map(lower))}.`, focus: null, firstStep: null }
      : { verdict: 'noChange', headline: 'You’re already green. Nothing needs to change.', focus: null, firstStep: null };
  }
  if (green) return { verdict: 'reachesGreen', headline: `This gets you to green: ${list(helpers.map(lower))}.`, focus: null, firstStep: null };
  return {
    verdict: raised ? 'improves' : 'noChange',
    headline: raised ? 'This raises your score, but not to green yet.' : 'Nothing tested raises your score yet.',
    focus, firstStep: engineStep(),
  };
}
