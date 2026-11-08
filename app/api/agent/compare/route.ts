import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '../../../../lib/auth/viewer';
import { buildPicture } from '../../../../lib/services/picture';
import { validCents } from '../../../../lib/engine/money';
import { validDate } from '../../../../lib/engine/validation';
import { daysBetween } from '../../../../lib/engine/dates';
import { DEMO_ASOF } from '../../../../lib/people';
import { buyAnswerId, tooManyBuyRuns, type BuyQuestion } from '../../../../lib/agent/buyOptions';
import { comparisonCached, reserveComparisonRun, runComparison, type ComparisonEvent } from '../../../../lib/agent/compare';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const raw = await request.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
  const cost = typeof body.cost === 'number' ? body.cost : NaN;
  const date = typeof body.date === 'string' ? body.date : '';
  const sourceAccountId = typeof body.sourceAccountId === 'string' ? body.sourceAccountId : '';
  const goalId = typeof body.goalId === 'string' && body.goalId ? body.goalId : undefined;
  if (label.length < 2 || !validCents(cost) || cost <= 0 || !validDate(date) || date < DEMO_ASOF || daysBetween(DEMO_ASOF, date) > 335) return NextResponse.json({ error: 'Choose an item, a positive price and a supported purchase date.' }, { status: 400 });
  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  const account = picture.accounts.find((a) => a.id === sourceAccountId && a.ownerMemberId === viewer.memberId && a.type !== 'Credit Card');
  if (!account || (goalId && (account.type !== 'Savings' || !picture.goals.some((g) => g.id === goalId && g.accountId === account.id)))) return NextResponse.json({ error: 'Choose your own checking or savings account and a matching goal.' }, { status: 400 });
  const purchase: BuyQuestion = { label, cost, date, sourceAccountId, ...(goalId ? { goalId } : {}) };
  const id = buyAnswerId(viewer.memberId, picture, purchase);
  if (!comparisonCached(id) && (!reserveComparisonRun(viewer.memberId) || await tooManyBuyRuns(viewer.memberId).catch(() => false))) return NextResponse.json({ error: 'You’ve compared several new purchases. Wait a few minutes and try again.' }, { status: 429 });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    cancel() { closed = true; },
    async start(controller) {
      const send = (event: ComparisonEvent) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
      try { await runComparison(viewer.memberId, picture, purchase, send); }
      catch { send({ type: 'error', error: 'The comparison couldn’t finish. Please try again.' }); }
      finally { if (!closed) { closed = true; controller.close(); } }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
