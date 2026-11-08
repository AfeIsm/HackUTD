// Purchase search + group approval. Pure functions on a Huddle, like lib/huddles.ts.
//
// Nothing here buys anything or moves money, and no pledge is ever changed. A proposal becomes
// the huddle's plan only when everyone with a login accepts it; then the normal
// reveal → agree → lock flow carries on, against the proposal's price.
import { type Huddle, MAX_SEARCH_RUNS, advance, payers, resetAgreements, totalPledged } from '../huddles';
import type { SearchTrigger } from './types';

const STUCK_MS = 2 * 60_000;

const isOpen = (h: Huddle) => h.phase !== 'locked' && h.phase !== 'cancelled';
const fundingKey = (h: Huddle) => `${h.totalCost}:${totalPledged(h)}`;
const running = (h: Huddle, nowMs: number) => h.search?.status === 'running' && nowMs - Date.parse(h.search.startedAt) < STUCK_MS;

/** Why a search can't start right now, or null if it can. */
export function searchBlocked(h: Huddle, nowMs: number): string | null {
  if (!isOpen(h)) return 'This huddle is finished.';
  if (running(h, nowMs)) return 'Nemotron is already searching.';
  if (h.review) return 'Finish reviewing the current proposal first.';
  if ((h.searchRuns ?? 0) >= MAX_SEARCH_RUNS) return `This huddle has used all ${MAX_SEARCH_RUNS} searches.`;
  return null;
}

export function startSearch(h: Huddle, trigger: SearchTrigger, runId: string, nowIso: string): Huddle {
  return {
    ...h, searchRuns: (h.searchRuns ?? 0) + 1,
    search: { runId, status: 'running', trigger, startedAt: nowIso, fundingKey: fundingKey(h), steps: [], proposals: [], noSolution: null, summary: null, usedDemo: false },
  };
}

/** All commitments revealed and short: search once for this exact funding state. */
export function maybeAutoSearch(h: Huddle, runId: string, nowMs: number): Huddle {
  const short = h.phase === 'revealed' && payers(h).every((p) => p.committed) && totalPledged(h) < h.totalCost;
  if (!short || h.selected || h.search?.fundingKey === fundingKey(h) || searchBlocked(h, nowMs)) return h;
  return startSearch(h, 'underfunded', runId, new Date(nowMs).toISOString());
}

/** "Review proposal": a new approval round. Earlier agreements no longer apply. */
export function startReview(h: Huddle, proposalId: string): Huddle | string {
  if (!isOpen(h)) return 'This huddle is finished.';
  if (h.review) return 'Another proposal is already being reviewed.';
  const proposal = h.search?.status === 'done' ? h.search.proposals.find((p) => p.id === proposalId) : undefined;
  if (!proposal) return 'That proposal is no longer available.';
  return { ...resetAgreements(h), review: { proposal, acceptedBy: [] }, message: `Everyone needs to review: ${proposal.title}.` };
}

export const reviewers = (h: Huddle) => h.participants.filter((p) => p.joined && p.userId);

/** Accepted by everyone → it becomes the plan. Called after accepts and membership changes. */
export function settleReview(h: Huddle): Huddle {
  if (!h.review) return h;
  const need = reviewers(h);
  if (need.length === 0 || !need.every((p) => h.review!.acceptedBy.includes(p.memberId))) return h;
  const { proposal } = h.review;
  return advance({
    ...resetAgreements(h), review: null, selected: proposal, totalCost: proposal.planTotal, lastDecline: null, fairSplit: null,
    message: `Everyone accepted ${proposal.title}. Nothing has been bought and no money has moved.`,
  });
}

export function acceptProposal(h: Huddle, memberId: string): Huddle {
  return settleReview({ ...h, review: h.review && { ...h.review, acceptedBy: [...new Set([...h.review.acceptedBy, memberId])] } });
}

/**
 * Someone said no. Their reason goes to Nemotron only: it may be about money, so the group
 * is never told who said no or why.
 */
export function rejectProposal(h: Huddle, reason: string): Huddle {
  if (!h.review) return h;
  const { proposal } = h.review;
  return {
    ...h, review: null,
    proposalFeedback: [...(h.proposalFeedback ?? []), { proposal: proposal.title, reason }].slice(-6),
    rejectedOfferKeys: [...(h.rejectedOfferKeys ?? []), proposal.offerKey],
    message: 'Someone asked for a different option.',
  };
}
