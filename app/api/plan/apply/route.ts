// POST /api/plan/apply {cancel?: string[], moveSavingsToChecking?: number (dollars)}
//   → re-checks the plan with the engine, sends the savings→checking move to Nessie as a REAL
//     transfer, records the plan so the score reflects it right away, and re-runs the health check.
// DELETE /api/plan/apply → undo every applied plan (removes the records; Nessie transfers are deleted best-effort).
// Nothing happens without the member clicking Apply: the AI proposes, a person approves.

import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { buildPicture, type AppliedPlanDoc } from '@/lib/services/picture';
import { runHealthCheck } from '@/lib/services/health';
import { runScenario } from '@/lib/agent/tools';
import { dataHash } from '@/lib/engine/hash';
import { nessieBase, nessieRequest } from '@/lib/nessie/provision';
import { DEMO_ASOF } from '@/lib/people';
import { money0 } from '@/lib/format';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const b = (await request.json().catch(() => ({}))) as { cancel?: unknown; moveSavingsToChecking?: unknown };
  const cancel = Array.isArray(b.cancel) ? b.cancel.filter((k): k is string => typeof k === 'string').slice(0, 10) : [];
  const moveDollars = typeof b.moveSavingsToChecking === 'number' && b.moveSavingsToChecking > 0 ? b.moveSavingsToChecking : undefined;
  if (!cancel.length && !moveDollars) return NextResponse.json({ error: 'Nothing to apply.' }, { status: 400 });

  // Same rules as the agent's simulations: own accounts, non-essential only, free savings only.
  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  const check = runScenario(picture, { cancel, moveSavingsToChecking: moveDollars }, DEMO_ASOF);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const hash = dataHash(picture);
  const planKey = createHash('sha256').update(JSON.stringify({ cancel: [...cancel].sort(), move: check.move ?? null })).digest('hex').slice(0, 24);
  const plans = (await getDb()).collection<AppliedPlanDoc>('appliedPlans');
  if (await plans.findOne({ memberId: viewer.memberId, dataHash: hash, planKey })) {
    return NextResponse.json({ error: 'This plan is already applied.' }, { status: 409 });
  }

  // The real bank write: a Nessie transfer from savings to checking.
  let nessieTransferId: string | null = null;
  let note = '';
  if (check.move) {
    try {
      const res = await nessieRequest<{ objectCreated?: { _id: string } }>(`/accounts/${check.move.fromAccountId}/transfers`, {
        medium: 'balance', payee_id: check.move.toAccountId, amount: check.move.amount / 100,
        transaction_date: DEMO_ASOF, status: 'completed', description: 'Wallet Whisperer plan: cover the bills dip',
      });
      nessieTransferId = res.objectCreated?._id ?? null;
    } catch {
      note = ' The bank transfer could not be sent, so it is recorded in the app only.';
    }
  }
  try {
    await plans.insertOne({ memberId: viewer.memberId, dataHash: hash, planKey, move: check.move ?? null, cancel, nessieTransferId, createdAt: new Date() });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return NextResponse.json({ error: 'This plan is already applied.' }, { status: 409 });
    throw err;
  }
  const what = [...(check.move ? [`moved ${money0(check.move.amount)} to checking`] : []), ...(cancel.length ? [`cancelled ${cancel.length} subscription${cancel.length === 1 ? '' : 's'}`] : [])].join(' and ');
  const health = await runHealthCheck(viewer.memberId, `you applied a plan (${what})`);
  return NextResponse.json({ ...health, applied: { nessieTransferId, note: `Applied: ${what}.${nessieTransferId ? ' A real Nessie transfer was created.' : ''}${note}` } });
}

export async function DELETE() {
  if (!mongoConfigured()) return NextResponse.json({ error: 'Saving needs MONGODB_URI' }, { status: 503 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const plans = (await getDb()).collection<AppliedPlanDoc>('appliedPlans');
  const docs = await plans.find({ memberId: viewer.memberId }).toArray();
  const key = process.env.NESSIE_API_KEY;
  for (const d of docs) {
    if (!d.nessieTransferId || !key) continue;
    // Best effort: remove the sandbox transfer too.
    await fetch(`${nessieBase()}/transfers/${d.nessieTransferId}?key=${encodeURIComponent(key)}`, { method: 'DELETE', signal: AbortSignal.timeout(8000) }).catch(() => null);
  }
  await plans.deleteMany({ memberId: viewer.memberId });
  return NextResponse.json(await runHealthCheck(viewer.memberId, 'applied plans undone'));
}
