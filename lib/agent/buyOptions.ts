// Can I buy: is the price realistic, and is there a better way to buy this? Same Nemotron search
// the huddles use, for one person. The engine decides what fits; the viewer's money never leaves
// the server, and SerpApi only ever gets the item's own words.

import { createHash } from 'node:crypto';
import type { AgentStep, FinancialPicture } from '../types';
import { canAfford, fitsBudget } from '../engine/afford';
import { dataHash } from '../engine/hash';
import { getDb, mongoConfigured } from '../db/mongo';
import { DEMO_ASOF } from '../people';
import type { Proposal, PurchaseSearch } from '../purchase/types';
import { checkBudget, type BudgetCheck } from '../purchase/viability';
import { briefFromGuess, interpretPlan } from './plan';
import { runPurchaseJob, type PurchaseJob } from './purchase';

export interface BuyQuestion { label: string; cost: number; date: string; sourceAccountId: string; goalId?: string }
export interface BuyResult { proposals: Proposal[]; noSolution: string | null; summary: string | null; usedDemo: boolean }
export type BuyEvent =
  | { type: 'check'; check: BudgetCheck | null }
  | { type: 'step'; step: AgentStep }
  | { type: 'done'; result: BuyResult }
  | { type: 'error'; error: string };

interface SavedAnswer { _id: string; memberId: string; check: BudgetCheck | null; steps: AgentStep[]; result: BuyResult; createdAt: Date; expiresAt: Date }

const SAVED_MS = 60 * 60_000; // same as the search cache: prices go stale
const MAX_NEW_RUNS_PER_10_MIN = 10; // each new question can spend real searches

const answers = async () => (mongoConfigured() ? (await getDb()).collection<SavedAnswer>('buyAnswers') : null);
const nothing = (noSolution: string): BuyResult => ({ proposals: [], noSolution, summary: null, usedDemo: false });

export async function tooManyBuyRuns(memberId: string): Promise<boolean> {
  const col = await answers();
  if (!col) return false;
  return (await col.countDocuments({ memberId, createdAt: { $gte: new Date(Date.now() - 10 * 60_000) } })) >= MAX_NEW_RUNS_PER_10_MIN;
}

export function buyAnswerId(memberId: string, picture: FinancialPicture, q: BuyQuestion): string {
  return createHash('sha256').update(JSON.stringify([memberId, dataHash(picture), q.label.toLowerCase(), q.cost, q.date, q.sourceAccountId, q.goalId ?? ''])).digest('hex');
}

export async function savedBuyAnswer(id: string): Promise<SavedAnswer | null> {
  const col = await answers();
  return (await col?.findOne({ _id: id, expiresAt: { $gt: new Date() } })) ?? null;
}

export function replayBuyAnswer(saved: SavedAnswer, send: (e: BuyEvent) => void) {
  send({ type: 'check', check: saved.check });
  for (const step of saved.steps) send({ type: 'step', step });
  send({ type: 'done', result: saved.result });
}

export async function runBuyOptions(memberId: string, id: string, picture: FinancialPicture, q: BuyQuestion, send: (e: BuyEvent) => void): Promise<void> {
  const guess = await interpretPlan(q.label);
  if (!guess) { send({ type: 'check', check: null }); send({ type: 'done', result: nothing('Nemotron couldn’t be reached, so there’s no price check right now.') }); return; }
  const brief = briefFromGuess(guess, q.label, 1, q.date, DEMO_ASOF);
  if (!brief) { send({ type: 'check', check: null }); send({ type: 'done', result: nothing(`Nemotron can’t shop for “${q.label}” online, so there’s no price check or alternatives for it.`) }); return; }

  const job: PurchaseJob = {
    solo: true, auditLabel: `Can I buy: ${q.label}`, planCost: q.cost, budget: q.cost, revealed: false, committed: 0, deadline: q.date,
    rejectedKeys: new Set(), feedback: [],
    fits: async (total, title) => fitsBudget(canAfford(picture, { ...q, label: title, cost: total }, DEMO_ASOF)),
    safeLimit: () => undefined,
  };

  const steps: AgentStep[] = [];
  let outcome: Partial<PurchaseSearch> | null = null;
  const step = async (type: AgentStep['type'], text: string, tool?: string) => {
    const s: AgentStep = { type, text, ...(tool ? { tool } : {}) };
    steps.push(s);
    send({ type: 'step', step: s });
  };

  // The price check goes first: its unfiltered market price is what exposes a too-cheap listing.
  const check = await checkBudget({ name: q.label, amount: q.cost, targetDate: q.date, people: 1 }).catch(() => null);
  send({ type: 'check', check });
  if (check && guess.kind === 'product') job.marketFloor = Math.round(check.typical * 0.4);
  await runPurchaseJob(job, brief, id, step, async (p) => { outcome = p; });

  const done = outcome as Partial<PurchaseSearch> | null;
  const result: BuyResult = { proposals: done?.proposals ?? [], noSolution: done?.noSolution ?? null, summary: done?.summary ?? null, usedDemo: done?.usedDemo ?? false };
  send({ type: 'done', result });
  if (result.usedDemo || !done) return; // a demo answer shouldn't block a real one later
  const now = Date.now();
  const col = await answers();
  await col?.replaceOne({ _id: id }, { memberId, check, steps, result, createdAt: new Date(now), expiresAt: new Date(now + SAVED_MS) }, { upsert: true })
    .catch((err: Error) => console.warn('Could not save buy answer:', err.message));
}
