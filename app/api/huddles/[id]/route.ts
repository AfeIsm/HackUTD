// POST /api/huddles/:id {action, ...} → one step in the huddle, run on the server:
//   answerInvite {accept} · pledge {amount, sourceAccountId, goalId?} (private health check here)
//   agree · requestChanges {reason} · edit {totalCost?, targetDate?} · cancel
// Returns my huddles, privacy-filtered for me.

import { after, NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { coachFailedPledge } from '@/lib/agent/coach';
import { runPurchaseAgent } from '@/lib/agent/purchase';
import { actOnHuddle, listHuddles, type HuddleAction } from '@/lib/services/huddle';
import type { DeclineReason } from '@/lib/types';

// Long enough for Nemotron's background pledge advice (after()) to finish.
export const maxDuration = 60;

const REASONS: DeclineReason[] = ['changeMyAmount', 'unfairSplit', 'totalOrDate', 'out'];

function parse(b: Record<string, unknown>): HuddleAction | null {
  switch (b.action) {
    case 'answerInvite':
      return typeof b.accept === 'boolean' ? { action: 'answerInvite', accept: b.accept } : null;
    case 'pledge':
      return typeof b.amount === 'number' && typeof b.sourceAccountId === 'string'
        ? { action: 'pledge', amount: b.amount, sourceAccountId: b.sourceAccountId, goalId: typeof b.goalId === 'string' && b.goalId ? b.goalId : undefined }
        : null;
    case 'agree':
      return { action: 'agree' };
    case 'requestChanges':
      return REASONS.includes(b.reason as DeclineReason) ? { action: 'requestChanges', reason: b.reason as DeclineReason } : null;
    case 'edit':
      return {
        action: 'edit',
        totalCost: typeof b.totalCost === 'number' ? b.totalCost : undefined,
        targetDate: typeof b.targetDate === 'string' ? b.targetDate : undefined,
      };
    case 'cancel':
      return { action: 'cancel' };
    case 'leave':
      return { action: 'leave' };
    case 'delete':
      return { action: 'delete' };
    case 'findOptions':
      return { action: 'findOptions' };
    case 'reviewProposal':
      return typeof b.proposalId === 'string' ? { action: 'reviewProposal', proposalId: b.proposalId } : null;
    case 'respondProposal':
      return typeof b.accept === 'boolean' ? { action: 'respondProposal', accept: b.accept, reason: typeof b.reason === 'string' ? b.reason : undefined } : null;
    default:
      return null;
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/huddles/[id]'>) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await ctx.params;
  const action = parse((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!action) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const result = await actOnHuddle(viewer, id, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const failed = result.failedPledge;
  if (failed) after(() => coachFailedPledge(viewer.memberId, failed));
  const search = result.startSearch;
  if (search) after(() => runPurchaseAgent(search.huddleId, search.runId));
  return NextResponse.json({ huddles: await listHuddles(viewer.memberId) });
}
