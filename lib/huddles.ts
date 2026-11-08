// Huddle phase machine + privacy filter. Pure functions (no I/O): the SERVER runs every
// action (lib/services/huddle.ts) and only ever sends the browser viewFor(huddle, viewer).
//
//   pledging → (everyone committed) revealed → (fully funded) agreeing → (everyone agreed) locked
//
// Privacy (PLAN.md §8): during pledging others only see WHETHER you committed; after reveal
// they see amounts. Your source account, health check result and feedback are never shared.

import type { DeclineReason, HuddlePhase } from './types';
import type { PledgeCheck } from './engine/split';
import type { PledgeAdvice } from './engine/pledgeAdvice';
import type { Proposal, ProposalReview, PurchaseBrief, PurchaseSearch } from './purchase/types';
import type { AgentPlan } from './agent/loop';

// Nemotron's private plan for keeping an at-risk commitment (written automatically).
export type CoachNote = AgentPlan & { createdAt: string };

export interface Participant {
  memberId: string;
  userId: string | null; // null = no login (kids)
  name: string;
  isPaying: boolean;
  joined: boolean; // invited friends join by accepting
  pledge: number | null;
  sourceAccountId: string | null; // PRIVATE
  goalId: string | null; // PRIVATE
  committed: boolean;
  checkPassed: boolean | null; // PRIVATE
  feedback: string | null; // PRIVATE: only this member ever sees it
  suggestion: { amount: number; text: string } | null; // PRIVATE
  agreed: boolean;
  // Re-checked on every health check, even after lock: would this pledge STILL keep you green?
  // Optional because huddles saved before this field existed don't have it.
  atRisk?: boolean;
  riskReason?: string | null; // PRIVATE: only this member sees why
  riskScore?: number | null; // PRIVATE: their score if the pledge went through now
  coach?: CoachNote | null; // PRIVATE: only this member ever sees it
  advice?: PledgeAdvice | null; // PRIVATE: the engine's numbers for a pledge that failed its check
  coachState?: 'thinking' | 'ready' | 'unavailable' | null; // PRIVATE: Nemotron's advice on that pledge
}

export interface Huddle {
  id: string;
  name: string;
  totalCost: number; // cents
  targetDate: string;
  createdBy: string; // memberId
  phase: HuddlePhase;
  round: number;
  message: string | null; // neutral group message, e.g. "Jordan requested changes: …"
  lastDecline: DeclineReason | null;
  fairSplit: Record<string, number> | null; // amounts only, computed on the server
  participants: Participant[];
  // Purchase search (optional: a huddle can just be splitting money).
  brief?: PurchaseBrief | null;
  search?: PurchaseSearch | null;
  review?: ProposalReview | null; // a proposal everyone is being asked to accept
  selected?: Proposal | null; // accepted by everyone
  searchRuns?: number;
  proposalFeedback?: { proposal: string; reason: string }[]; // PRIVATE: Nemotron only, never sent to any browser
  rejectedOfferKeys?: string[];
}

export const newParticipant = (memberId: string, userId: string | null, name: string, over: Partial<Participant> = {}): Participant => ({
  memberId, userId, name, isPaying: true, joined: true, pledge: null, sourceAccountId: null, goalId: null,
  committed: false, checkPassed: null, feedback: null, suggestion: null, agreed: false,
  atRisk: false, riskReason: null, riskScore: null, ...over,
});

export const payers = (h: Huddle) => h.participants.filter((p) => p.isPaying);
export const totalPledged = (h: Huddle) => payers(h).reduce((s, p) => s + (p.committed ? p.pledge ?? 0 : 0), 0);

export function advance(h: Huddle): Huddle {
  if (h.phase === 'locked' || h.phase === 'cancelled') return h;
  const ps = payers(h);
  const allCommitted = ps.length > 0 && ps.every((p) => p.committed);
  if (!allCommitted) return { ...h, phase: h.phase === 'pledging' ? 'pledging' : 'revealed' };
  if (totalPledged(h) < h.totalCost) return { ...h, phase: 'revealed' };
  if (ps.every((p) => p.agreed)) return { ...h, phase: 'locked' };
  return { ...h, phase: 'agreeing' };
}

const updateParticipant = (h: Huddle, memberId: string, fn: (p: Participant) => Participant): Huddle => ({
  ...h, participants: h.participants.map((p) => (p.memberId === memberId ? fn(p) : p)),
});
export const resetAgreements = (h: Huddle): Huddle => ({ ...h, participants: h.participants.map((p) => ({ ...p, agreed: false })) });

// ---------- actions (each returns the next huddle) ----------
/** Removing a member invalidates approvals. A one-person group has no remaining workflow. */
export function applyLeave(h: Huddle, memberId: string): Huddle | null {
  const participants = h.participants.filter((p) => p.memberId !== memberId);
  if (participants.length <= 1) return null;
  const owner = h.createdBy === memberId
    ? participants.find((p) => p.joined && p.userId)?.memberId ?? participants.find((p) => p.userId)?.memberId
    : h.createdBy;
  // Managed children cannot own a group without an account holder to administer it.
  if (!owner) return null;
  const name = h.participants.find((p) => p.memberId === memberId)?.name ?? 'A member';
  return advance({ ...h, createdBy: owner, participants: participants.map((p) => ({ ...p, agreed: false })),
    phase: h.phase === 'cancelled' ? 'cancelled' : 'pledging', fairSplit: null, lastDecline: null,
    message: `${name} left the huddle. Please review the updated commitments.`,
  });
}

export function applyInviteAnswer(h: Huddle, memberId: string, accept: boolean): Huddle {
  return advance({
    ...h,
    participants: accept
      ? h.participants.map((p) => (p.memberId === memberId ? { ...p, joined: true } : p))
      : h.participants.filter((p) => p.memberId !== memberId),
  });
}

export function applyPledge(h: Huddle, memberId: string, pledge: { amount: number; sourceAccountId: string; goalId?: string }, check: PledgeCheck, advice: PledgeAdvice | null = null): Huddle {
  // a new pledge resets agreements: everyone re-agrees to the new numbers
  return advance(updateParticipant(resetAgreements(h), memberId, (p) => ({
    ...p, pledge: pledge.amount, sourceAccountId: pledge.sourceAccountId, goalId: pledge.goalId ?? null,
    committed: check.passed, checkPassed: check.passed, feedback: check.reason, suggestion: null,
    atRisk: false, riskReason: null, riskScore: null, coach: null, // a fresh check replaces any old warning
    advice, coachState: advice ? 'thinking' : null,
  })));
}

export function applyAgree(h: Huddle, memberId: string): Huddle {
  return advance(updateParticipant(h, memberId, (p) => ({ ...p, agreed: true })));
}

const DECLINE_TEXT: Record<DeclineReason, string> = {
  changeMyAmount: 'wants to change their amount',
  unfairSplit: 'the split feels unfair',
  totalOrDate: 'the total or date doesn’t work',
  out: 'is out',
};

export function applyDecline(h: Huddle, memberId: string, reason: DeclineReason, fairSplit: Record<string, number> | null = null): Huddle {
  const name = h.participants.find((p) => p.memberId === memberId)?.name ?? 'Someone';
  let next: Huddle = {
    ...resetAgreements(h),
    round: h.round + 1,
    lastDecline: reason,
    fairSplit: reason === 'unfairSplit' ? fairSplit : null,
    message: `${name} requested changes: ${DECLINE_TEXT[reason]}.${h.round + 1 > 3 ? ' That was the last round, so the creator decides what happens next.' : ''}`,
  };
  if (reason === 'changeMyAmount') {
    next = updateParticipant(next, memberId, (p) => ({ ...p, committed: false, checkPassed: null, feedback: null, suggestion: null }));
  }
  if (reason === 'out') {
    next = updateParticipant(next, memberId, (p) => ({ ...p, isPaying: false, pledge: null, committed: false }));
  }
  return advance(next);
}

export function applyEdit(h: Huddle, changes: { totalCost?: number; targetDate?: string }): Huddle {
  return advance({ ...resetAgreements(h), ...changes, message: null });
}

export const applyCancel = (h: Huddle): Huddle => ({ ...h, phase: 'cancelled' });

// ---------- privacy filter: the ONLY shape that leaves the server ----------
export interface PublicParticipant {
  memberId: string;
  name: string;
  isPaying: boolean;
  joined: boolean;
  committed: boolean;
  pledge: number | null; // null until revealed
  agreed: boolean | null; // null until the agreeing phase
}

export interface HuddleClientView {
  id: string;
  name: string;
  totalCost: number;
  targetDate: string;
  createdBy: string;
  phase: HuddlePhase;
  round: number;
  message: string | null;
  lastDecline: DeclineReason | null;
  participants: PublicParticipant[];
  committedCount: number;
  payingCount: number;
  totalCommitted: number | null; // null while pledging
  shortfall: number | null; // null while pledging
  // Committed pledges that no longer pass the health check. A COUNT only: the group learns that a
  // commitment is at risk, never whose or why (PLAN.md §8). The person sees their own in `me`.
  atRiskCount: number;
  fairSplit: { memberId: string; name: string; amount: number }[] | null;
  me: Participant | null; // ONLY the viewer's own row, private fields included
  purchase: PurchaseView | null;
}

export type ProposalView = Proposal & { fundingGap: number | null }; // null until commitments are revealed
export interface PurchaseView {
  brief: PurchaseBrief;
  search: (Omit<PurchaseSearch, 'proposals' | 'fundingKey'> & { proposals: ProposalView[] }) | null;
  review: { proposal: ProposalView; acceptedCount: number; neededCount: number; iAccepted: boolean; iMustRespond: boolean } | null;
  selected: ProposalView | null;
  searchesLeft: number;
}

export const MAX_SEARCH_RUNS = 6; // each run can spend real SerpApi searches

function purchaseView(h: Huddle, viewerMemberId: string, revealed: boolean, total: number): PurchaseView | null {
  if (!h.brief) return null;
  const withGap = (p: Proposal): ProposalView => ({ ...p, fundingGap: revealed ? Math.max(0, p.total - total) : null });
  const needed = h.participants.filter((p) => p.joined && p.userId);
  const s = h.search;
  return {
    brief: h.brief,
    // Field by field on purpose: fundingKey holds the committed total, hidden while pledging.
    search: s ? { runId: s.runId, status: s.status, trigger: s.trigger, startedAt: s.startedAt, steps: s.steps, noSolution: s.noSolution, summary: s.summary, usedDemo: s.usedDemo, proposals: s.proposals.map(withGap) } : null,
    review: h.review && h.phase !== 'cancelled' ? {
      proposal: withGap(h.review.proposal),
      acceptedCount: needed.filter((p) => h.review!.acceptedBy.includes(p.memberId)).length,
      neededCount: needed.length,
      iAccepted: h.review.acceptedBy.includes(viewerMemberId),
      iMustRespond: needed.some((p) => p.memberId === viewerMemberId) && !h.review.acceptedBy.includes(viewerMemberId),
    } : null,
    selected: h.selected ? withGap(h.selected) : null,
    searchesLeft: Math.max(0, MAX_SEARCH_RUNS - (h.searchRuns ?? 0)),
  };
}

export function viewFor(h: Huddle, viewerMemberId: string): HuddleClientView {
  const revealed = h.phase !== 'pledging';
  const ps = payers(h);
  const total = totalPledged(h);
  return {
    id: h.id, name: h.name, totalCost: h.totalCost, targetDate: h.targetDate, createdBy: h.createdBy,
    phase: h.phase, round: h.round, message: h.message, lastDecline: h.lastDecline,
    participants: h.participants.map((p) => ({
      memberId: p.memberId,
      name: p.name,
      isPaying: p.isPaying,
      joined: p.joined,
      committed: p.committed,
      pledge: revealed && p.committed ? p.pledge : null,
      agreed: h.phase === 'agreeing' || h.phase === 'locked' ? p.agreed : null,
    })),
    committedCount: ps.filter((p) => p.committed).length,
    payingCount: ps.length,
    totalCommitted: revealed ? total : null,
    shortfall: revealed ? Math.max(0, h.totalCost - total) : null,
    atRiskCount: h.phase === 'cancelled' ? 0 : ps.filter((p) => p.committed && p.atRisk).length,
    fairSplit:
      h.lastDecline === 'unfairSplit' && h.fairSplit && h.phase !== 'locked'
        ? Object.entries(h.fairSplit).map(([memberId, amount]) => ({
            memberId, amount, name: h.participants.find((p) => p.memberId === memberId)?.name ?? memberId,
          }))
        : null,
    me: h.participants.find((p) => p.memberId === viewerMemberId) ?? null,
    purchase: purchaseView(h, viewerMemberId, revealed, total),
  };
}
