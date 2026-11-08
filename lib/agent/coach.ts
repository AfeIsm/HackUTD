// Unprompted coaching: when a member's huddle commitment stops being affordable, Nemotron runs
// on its own (no one asked) and writes that member a PRIVATE plan to keep it. Scheduled with
// after() so the purchase/health response isn't slowed down. The group only sees the warning.

import type { FinancialPicture } from '../types';
import { DEMO_ASOF } from '../people';
import { money0, shortDate } from '../format';
import { saveCoachNote, saveFailedPledgeCoach, type FailedPledge, type NewRisk } from '../services/huddle';
import { buildPicture } from '../services/picture';
import { getDb } from '../db/mongo';
import { agentConfigured } from './client';

// Runs after the response, where no one sees console output: record each run in Mongo.
const log = async (entry: Record<string, unknown>) => {
  try { await (await getDb()).collection('coachLog').insertOne({ ...entry, at: new Date() }); } catch { /* logging must never break coaching */ }
};
import { runAgent } from './loop';

/** A pledge just failed its private check: Nemotron reads this member's money and advises them. */
export async function coachFailedPledge(memberId: string, f: FailedPledge): Promise<void> {
  const context = { memberId, huddleId: f.huddleId, kind: 'failedPledge' };
  try {
    if (!agentConfigured()) { await log({ ...context, stage: 'skipped', reason: 'no NVIDIA_API_KEY' }); await saveFailedPledgeCoach(f, memberId, null); return; }
    const { picture } = await buildPicture(memberId);
    if (!picture) { await log({ ...context, stage: 'noPicture' }); await saveFailedPledgeCoach(f, memberId, null); return; }
    await log({ ...context, stage: 'start' });
    const a = f.advice;
    const facts = a.notGreenNow
      ? 'My health score is not green yet, so no amount can pass until that is fixed.'
      : `Our engine says ${money0(a.safeToday)} is the most I can pledge today, so I am ${money0(a.gap)} short of what I wanted, or ${money0(a.weeklyToSave)} a week until then.`;
    const question = `My ${money0(f.pledge)} pledge to the group plan "${f.name}" failed its private health check. It would be paid today from account ${f.sourceAccountId}, and the group pays by ${shortDate(f.targetDate)}. ${facts} Look at my paychecks, bills, subscriptions, spending by category and savings goals. Tell me specifically which subscriptions to cancel and which kinds of spending to cut back on so I can make this pledge, and test those changes together with the pledge.`;
    const pledge = { amount: f.pledge / 100, date: DEMO_ASOF, accountId: f.sourceAccountId, label: `${f.name} pledge`, ...(f.goalId ? { goalId: f.goalId } : {}) };
    const answer = await runAgent(picture, question, DEMO_ASOF, () => {}, pledge);
    // A clean "yes" can't stand here: the real pledge check, which also tests the account's cash, just failed.
    const judged = answer.plan?.verdict === 'yes' ? { ...answer.plan, verdict: 'notYet' as const, headline: 'Not from this account today.' } : answer.plan;
    const plan = judged && { ...judged, actions: judged.actions.filter((x) => !x.startsWith(`${pledge.label}:`)) }; // the card already states the pledge
    await saveFailedPledgeCoach(f, memberId, plan ? { ...plan, createdAt: new Date().toISOString() } : null);
    await log({ ...context, stage: plan ? 'saved' : 'noPlan', verdict: plan?.verdict ?? null, steps: answer.steps.length });
  } catch (err) {
    await log({ ...context, stage: 'error', error: (err as Error).message });
    console.warn(`Pledge coach failed for ${memberId}/${f.huddleId}:`, (err as Error).message);
    await saveFailedPledgeCoach(f, memberId, null).catch(() => {});
  }
}

export async function coachAtRiskPledges(memberId: string, picture: FinancialPicture, risks: NewRisk[]): Promise<void> {
  if (!agentConfigured()) { await log({ memberId, stage: 'skipped', reason: 'no NVIDIA_API_KEY' }); return; }
  for (const r of risks) {
    await log({ memberId, huddleId: r.huddleId, stage: 'start' });
    // A pledge is funded NOW from its account (same rule as the pledge check), so judge exactly that.
    const pledge = { amount: r.pledge / 100, date: DEMO_ASOF, accountId: r.sourceAccountId, label: `${r.name} commitment` };
    const question = `My ${money0(r.pledge)} commitment to the group plan "${r.name}" is paid today from account ${r.sourceAccountId}, and it is no longer affordable after my recent spending (the group pays by ${shortDate(r.targetDate)}). Test the commitment as a purchase of ${money0(r.pledge)} today from that account. How can I keep it and stay green?`;
    try {
      const answer = await runAgent(picture, question, DEMO_ASOF, () => {}, pledge);
      if (answer.plan) await saveCoachNote(r.huddleId, memberId, { ...answer.plan, createdAt: new Date().toISOString() });
      await log({ memberId, huddleId: r.huddleId, stage: answer.plan ? 'saved' : 'noPlan', verdict: answer.plan?.verdict ?? null, steps: answer.steps.length });
    } catch (err) {
      await log({ memberId, huddleId: r.huddleId, stage: 'error', error: (err as Error).message });
      console.warn(`Huddle coach failed for ${memberId}/${r.huddleId}:`, (err as Error).message);
    }
  }
}
