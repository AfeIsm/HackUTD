// POST /api/buy/options {label, cost (cents), date, sourceAccountId, goalId?}
//   → streams NDJSON: {"type":"check",...} {"type":"step",...} then {"type":"done","result":{...}}
// The viewer comes from the session, and the funding account has to be theirs.

import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { buildPicture } from '@/lib/services/picture';
import { validCents } from '@/lib/engine/money';
import { validDate } from '@/lib/engine/validation';
import { DEMO_ASOF } from '@/lib/people';
import { buyAnswerId, replayBuyAnswer, runBuyOptions, savedBuyAnswer, tooManyBuyRuns, type BuyEvent, type BuyQuestion } from '@/lib/agent/buyOptions';

export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 60) : '';
  const cost = typeof b.cost === 'number' ? b.cost : NaN;
  const date = typeof b.date === 'string' ? b.date : '';
  const sourceAccountId = typeof b.sourceAccountId === 'string' ? b.sourceAccountId : '';
  const goalId = typeof b.goalId === 'string' && b.goalId ? b.goalId : undefined;
  if (label.length < 2 || !validCents(cost) || cost <= 0 || !validDate(date) || date < DEMO_ASOF) return NextResponse.json({ error: 'Need an item, a cost and a date.' }, { status: 400 });

  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  if (!picture.accounts.some((a) => a.id === sourceAccountId && a.ownerMemberId === viewer.memberId)) return NextResponse.json({ error: 'Pick one of your own accounts.' }, { status: 400 });

  const q: BuyQuestion = { label, cost, date, sourceAccountId, goalId };
  const id = buyAnswerId(viewer.memberId, picture, q);
  const saved = await savedBuyAnswer(id).catch(() => null);
  if (!saved && await tooManyBuyRuns(viewer.memberId).catch(() => false)) {
    return NextResponse.json({ error: 'You’ve checked a lot of new items. Wait a few minutes and try again.' }, { status: 429 });
  }

  const enc = new TextEncoder();
  let closed = false; // the price check can still be running after a failure or a client cancel
  const stream = new ReadableStream({
    cancel() { closed = true; },
    async start(controller) {
      const send = (e: BuyEvent) => { if (!closed) controller.enqueue(enc.encode(JSON.stringify(e) + '\n')); };
      try {
        if (saved) replayBuyAnswer(saved, send);
        else await runBuyOptions(viewer.memberId, id, picture, q, send);
      } catch (err) {
        console.warn('Buy options failed:', (err as Error).message);
        send({ type: 'error', error: 'The price search hit a problem. Try again.' });
      } finally {
        if (!closed) { closed = true; controller.close(); }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
