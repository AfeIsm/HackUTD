import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '../../../../lib/auth/viewer';
import { buildPicture } from '../../../../lib/services/picture';
import { validCents } from '../../../../lib/engine/money';
import { MAX_PURCHASES, purchaseTotal } from '../../../../lib/engine/basket';
import { validDate } from '../../../../lib/engine/validation';
import { daysBetween } from '../../../../lib/engine/dates';
import { DEMO_ASOF } from '../../../../lib/people';
import type { BuyQuestion } from '../../../../lib/agent/buyOptions';
import { comparisonId, comparisonCached, reserveComparisonRun, runComparison, type ComparisonEvent } from '../../../../lib/agent/compare';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const raw = await request.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const rows: unknown[] = 'purchases' in body ? Array.isArray(body.purchases) ? body.purchases : [] : [body];
  if (rows.length < 1 || rows.length > MAX_PURCHASES) return NextResponse.json({ error: `Add between one and ${MAX_PURCHASES} purchases.` }, { status: 400 });
  const purchases: BuyQuestion[] = [];
  for (const row of rows) {
    const item = row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {};
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 60) : '';
    const cost = typeof item.cost === 'number' ? item.cost : NaN;
    const date = typeof item.date === 'string' ? item.date : '';
    const sourceAccountId = typeof item.sourceAccountId === 'string' ? item.sourceAccountId : '';
    const goalId = typeof item.goalId === 'string' && item.goalId ? item.goalId : undefined;
    if (label.length < 2 || !validCents(cost) || cost <= 0 || !sourceAccountId || (item.goalId != null && typeof item.goalId !== 'string') || !validDate(date) || date < DEMO_ASOF || daysBetween(DEMO_ASOF, date) > 335) return NextResponse.json({ error: 'Give every purchase an item, a positive price, an account and a supported date.' }, { status: 400 });
    purchases.push({ label, cost, date, sourceAccountId, ...(goalId ? { goalId } : {}) });
  }
  const first = purchases[0];
  if (purchaseTotal(purchases) === null) return NextResponse.json({ error: 'The combined purchase total is too large.' }, { status: 400 });
  if (purchases.some((item) => item.sourceAccountId !== first.sourceAccountId || (item.goalId ?? '') !== (first.goalId ?? ''))) return NextResponse.json({ error: 'Use the same account and savings goal for every purchase in this comparison.' }, { status: 400 });
  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  const account = picture.accounts.find((a) => a.id === first.sourceAccountId && a.ownerMemberId === viewer.memberId && a.type !== 'Credit Card');
  if (!account || (first.goalId && (account.type !== 'Savings' || !picture.goals.some((g) => g.id === first.goalId && g.accountId === account.id)))) return NextResponse.json({ error: 'Choose your own checking or savings account and a matching goal.' }, { status: 400 });
  const id = comparisonId(viewer.memberId, picture, purchases);
  if (!comparisonCached(id) && !reserveComparisonRun(viewer.memberId)) return NextResponse.json({ error: 'You’ve compared several new purchases. Wait a few minutes and try again.' }, { status: 429 });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    cancel() { closed = true; },
    async start(controller) {
      const send = (event: ComparisonEvent) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
      try { await runComparison(viewer.memberId, picture, purchases, send); }
      catch { send({ type: 'error', error: 'The comparison couldn’t finish. Please try again.' }); }
      finally { if (!closed) { closed = true; controller.close(); } }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
