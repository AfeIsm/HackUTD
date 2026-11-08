'use client';

// Huddles, friend invites and friendships, kept in browser memory for now so the whole
// flow works on one laptop by switching "Viewing as". Resets on refresh.
// TODO(backend): move to MongoDB + app/api/huddles routes. The privacy rules in viewFor()
// must then run on the server (PLAN.md §8): the browser should never receive hidden data.

import { useSyncExternalStore } from 'react';
import type { DeclineReason, HuddleParticipantPublic, HuddlePhase, Source } from './types';
import type { PledgeCheck } from './engine/split';
import { getPerson } from './people';

export interface Participant {
  memberId: string;
  isPaying: boolean;
  joined: boolean; // friends join by accepting an invite
  pledge: number | null;
  source: Source | null;
  goalId: string | null;
  committed: boolean;
  checkPassed: boolean | null;
  feedback: string | null; // PRIVATE: only this member ever sees it
  suggestion: { amount: number; text: string } | null; // PRIVATE
  agreed: boolean;
}

export interface Huddle {
  id: string;
  name: string;
  totalCost: number;
  targetDate: string;
  createdBy: string;
  phase: HuddlePhase;
  round: number;
  message: string | null; // neutral group message, e.g. "Jordan requested changes: …"
  lastDecline: DeclineReason | null;
  participants: Participant[];
}

export interface Invite {
  id: string;
  fromId: string;
  toId: string;
  huddleId: string | null; // null = plain friend request
  status: 'pending' | 'accepted' | 'declined';
}

interface State {
  huddles: Huddle[];
  invites: Invite[];
  friendships: [string, string][];
}

const participant = (memberId: string, over: Partial<Participant> = {}): Participant => ({
  memberId, isPaying: true, joined: true, pledge: null, source: null, goalId: null,
  committed: false, checkPassed: null, feedback: null, suggestion: null, agreed: false, ...over,
});

let state: State = {
  huddles: [
    {
      id: 'orlando', name: 'Orlando trip', totalCost: 4000, targetDate: '2027-03-20', createdBy: 'alex',
      phase: 'pledging', round: 1, message: null, lastDecline: null,
      participants: [
        participant('alex'),
        participant('jordan', { pledge: 1800, source: 'checking', committed: true, checkPassed: true }),
        participant('maya', { pledge: 100, source: 'checking', committed: true, checkPassed: true }),
        participant('leo', { isPaying: false }),
        participant('sam', { joined: false }),
      ],
    },
  ],
  invites: [{ id: 'inv-1', fromId: 'alex', toId: 'sam', huddleId: 'orlando', status: 'pending' }],
  friendships: [],
};

export const getHuddleState = (): State => state; // for tests (and the future API)

const listeners = new Set<() => void>();
function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}
export function useHuddleStore(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

// ---------- phase machine ----------
export const payers = (h: Huddle) => h.participants.filter((p) => p.isPaying);
export const totalPledged = (h: Huddle) => payers(h).reduce((s, p) => s + (p.committed ? p.pledge ?? 0 : 0), 0);

function advance(h: Huddle): Huddle {
  if (h.phase === 'locked' || h.phase === 'cancelled') return h;
  const ps = payers(h);
  const allCommitted = ps.length > 0 && ps.every((p) => p.committed);
  if (!allCommitted) return { ...h, phase: h.phase === 'pledging' ? 'pledging' : 'revealed' };
  if (totalPledged(h) < h.totalCost) return { ...h, phase: 'revealed' };
  if (ps.every((p) => p.agreed)) return { ...h, phase: 'locked' };
  return { ...h, phase: 'agreeing' };
}

function updateHuddle(id: string, fn: (h: Huddle) => Huddle) {
  setState({ ...state, huddles: state.huddles.map((h) => (h.id === id ? advance(fn(h)) : h)) });
}
function updateParticipant(h: Huddle, memberId: string, fn: (p: Participant) => Participant): Huddle {
  return { ...h, participants: h.participants.map((p) => (p.memberId === memberId ? fn(p) : p)) };
}

// ---------- actions ----------
export function submitPledge(
  huddleId: string, memberId: string, pledge: { amount: number; source: Source; goalId?: string }, check: PledgeCheck,
) {
  updateHuddle(huddleId, (h) => {
    // a new pledge resets agreements: everyone re-agrees to the new numbers
    const reset = { ...h, participants: h.participants.map((p) => ({ ...p, agreed: false })) };
    return updateParticipant(reset, memberId, (p) => ({
      ...p,
      pledge: pledge.amount,
      source: pledge.source,
      goalId: pledge.goalId ?? null,
      committed: check.passed,
      checkPassed: check.passed,
      feedback: check.reason,
      suggestion: check.suggestion ? { amount: check.suggestion.amount, text: check.suggestion.text } : null,
    }));
  });
}

export function agree(huddleId: string, memberId: string) {
  updateHuddle(huddleId, (h) => updateParticipant(h, memberId, (p) => ({ ...p, agreed: true })));
}

const DECLINE_TEXT: Record<DeclineReason, string> = {
  changeMyAmount: 'wants to change their amount',
  unfairSplit: 'the split feels unfair',
  totalOrDate: 'the total or date doesn’t work',
  out: 'is out',
};

export function decline(huddleId: string, memberId: string, reason: DeclineReason) {
  const name = getPerson(memberId).name;
  updateHuddle(huddleId, (h) => {
    let next: Huddle = {
      ...h,
      round: h.round + 1,
      lastDecline: reason,
      message: `${name} requested changes: ${DECLINE_TEXT[reason]}.${h.round + 1 > 3 ? ' That was the last round, so the creator decides what happens next.' : ''}`,
      participants: h.participants.map((p) => ({ ...p, agreed: false })),
    };
    if (reason === 'changeMyAmount') {
      next = updateParticipant(next, memberId, (p) => ({ ...p, committed: false, checkPassed: null, feedback: null, suggestion: null }));
    }
    if (reason === 'out') {
      next = updateParticipant(next, memberId, (p) => ({ ...p, isPaying: false, pledge: null, committed: false }));
    }
    return next;
  });
}

export function editHuddle(huddleId: string, changes: { totalCost?: number; targetDate?: string }) {
  updateHuddle(huddleId, (h) => ({
    ...h, ...changes, message: null,
    participants: h.participants.map((p) => ({ ...p, agreed: false })),
  }));
}

export function cancelHuddle(huddleId: string) {
  setState({ ...state, huddles: state.huddles.map((h) => (h.id === huddleId ? { ...h, phase: 'cancelled' } : h)) });
}

export function createHuddle(input: {
  name: string; totalCost: number; targetDate: string; createdBy: string; members: { id: string; isPaying: boolean }[];
}): string {
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'huddle';
  let id = base;
  for (let n = 2; state.huddles.some((h) => h.id === id); n++) id = `${base}-${n}`;
  const friends = input.members.filter((m) => getPerson(m.id).role === 'friend');
  setState({
    ...state,
    huddles: [
      ...state.huddles,
      {
        id, name: input.name, totalCost: input.totalCost, targetDate: input.targetDate, createdBy: input.createdBy,
        phase: 'pledging', round: 1, message: null, lastDecline: null,
        participants: input.members.map((m) =>
          participant(m.id, { isPaying: m.isPaying, joined: getPerson(m.id).role !== 'friend' })),
      },
    ],
    invites: [
      ...state.invites,
      ...friends.map((f, i) => ({
        id: `inv-${state.invites.length + i + 1}`, fromId: input.createdBy, toId: f.id, huddleId: id, status: 'pending' as const,
      })),
    ],
  });
  return id;
}

export function sendFriendRequest(fromId: string, toId: string) {
  setState({
    ...state,
    invites: [...state.invites, { id: `inv-${state.invites.length + 1}`, fromId, toId, huddleId: null, status: 'pending' }],
  });
}

export function respondToInvite(inviteId: string, accept: boolean) {
  const invite = state.invites.find((i) => i.id === inviteId);
  if (!invite) return;
  const invites = state.invites.map((i) => (i.id === inviteId ? { ...i, status: accept ? ('accepted' as const) : ('declined' as const) } : i));
  const already = state.friendships.some(([a, b]) => (a === invite.fromId && b === invite.toId) || (a === invite.toId && b === invite.fromId));
  const friendships: [string, string][] = accept && !already ? [...state.friendships, [invite.fromId, invite.toId]] : state.friendships;
  const huddles = state.huddles.map((h) => {
    if (h.id !== invite.huddleId) return h;
    return advance({
      ...h,
      participants: accept
        ? h.participants.map((p) => (p.memberId === invite.toId ? { ...p, joined: true } : p))
        : h.participants.filter((p) => p.memberId !== invite.toId),
    });
  });
  setState({ ...state, invites, friendships, huddles });
}

export function friendsOf(s: State, memberId: string): string[] {
  return s.friendships.flatMap(([a, b]) => (a === memberId ? [b] : b === memberId ? [a] : []));
}

// ---------- privacy filter: what OTHER members may see ----------
// Pledging: only whether each person committed. After reveal: amounts. Never source, checks or feedback.
export function publicParticipants(h: Huddle): HuddleParticipantPublic[] {
  const revealed = h.phase !== 'pledging';
  return h.participants.map((p) => ({
    memberId: p.memberId,
    name: getPerson(p.memberId).name,
    isPaying: p.isPaying,
    committed: p.committed,
    pledge: revealed && p.committed ? p.pledge : null,
    agreed: h.phase === 'agreeing' || h.phase === 'locked' ? p.agreed : null,
  }));
}
