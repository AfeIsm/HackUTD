// Saved agent answers (MongoDB Atlas): same question + same data fingerprint → the saved answer,
// with no new Nemotron call. Rehearsing the demo costs one run, and answers never drift.

import { createHash } from 'node:crypto';
import { getDb, mongoConfigured } from '../db/mongo';
import type { AgentAnswer } from './loop';

interface AgentAnswerDoc { memberId: string; dataHash: string; questionKey: string; answer: AgentAnswer; createdAt: Date }

export const questionKey = (q: string) => createHash('sha256').update(q.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 32);

const col = async () => (await getDb()).collection<AgentAnswerDoc>('agentAnswers');

export async function findAnswer(memberId: string, dataHash: string, question: string): Promise<AgentAnswer | null> {
  if (!mongoConfigured()) return null;
  const doc = await (await col()).findOne({ memberId, dataHash, questionKey: questionKey(question) });
  return doc ? { ...doc.answer, cached: true } : null;
}

export async function saveAnswer(memberId: string, dataHash: string, answer: AgentAnswer): Promise<void> {
  if (!mongoConfigured()) return;
  await (await col()).updateOne(
    { memberId, dataHash, questionKey: questionKey(answer.question) },
    { $setOnInsert: { memberId, dataHash, questionKey: questionKey(answer.question), answer, createdAt: new Date() } },
    { upsert: true },
  );
}

/** New (non-saved) runs in the last 10 minutes: protects the shared 40-requests/minute limit. */
export async function recentRuns(memberId: string): Promise<number> {
  if (!mongoConfigured()) return 0;
  return (await col()).countDocuments({ memberId, createdAt: { $gt: new Date(Date.now() - 10 * 60_000) } });
}
