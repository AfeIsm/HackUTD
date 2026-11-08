// Unprompted coaching: when a member's huddle commitment stops being affordable, Nemotron runs
// on its own (no one asked) and writes that member a PRIVATE plan to keep it. Scheduled with
// after() so the purchase/health response isn't slowed down. The group only sees the warning.

import type { FinancialPicture } from '../types';
import { DEMO_ASOF } from '../people';
import { money0, shortDate } from '../format';
import { saveCoachNote, type NewRisk } from '../services/huddle';
import { getDb } from '../db/mongo';
import { agentConfigured } from './client';

// Runs after the response, where no one sees console output: record each run in Mongo.
const log = async (entry: Record<string, unknown>) => {
  try { await (await getDb()).collection('coachLog').insertOne({ ...entry, at: new Date() }); } catch { /* logging must never break coaching */ }
};
import { runAgent } from './loop';

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
