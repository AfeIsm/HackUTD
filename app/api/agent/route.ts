// POST /api/agent {question} → streams the agent's steps as NDJSON lines, then the answer.
//   {"type":"step","step":{...}}  ...  {"type":"done","answer":{...}}  or  {"type":"error","error":"..."}
// The viewer comes from the session; the agent only ever sees their own picture.

import { NextResponse, type NextRequest } from 'next/server';
import { requireViewer } from '@/lib/auth/viewer';
import { buildPicture } from '@/lib/services/picture';
import { dataHash } from '@/lib/engine/hash';
import { DEMO_ASOF } from '@/lib/people';
import { agentConfigured } from '@/lib/agent/client';
import { runAgent } from '@/lib/agent/loop';
import { findAnswer, recentRuns, saveAnswer } from '@/lib/agent/saved';

export const maxDuration = 60;
const MAX_NEW_RUNS_PER_10_MIN = 8;

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!agentConfigured()) return NextResponse.json({ error: 'The AI coach isn’t set up on this server (NVIDIA_API_KEY missing).' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question.length < 3 || question.length > 400) return NextResponse.json({ error: 'Ask a question (up to 400 characters).' }, { status: 400 });

  const { picture } = await buildPicture(viewer.memberId);
  if (!picture) return NextResponse.json({ error: 'No accounts found.' }, { status: 404 });
  const hash = dataHash(picture);

  const saved = await findAnswer(viewer.memberId, hash, question).catch(() => null);
  if (!saved && await recentRuns(viewer.memberId).catch(() => 0) >= MAX_NEW_RUNS_PER_10_MIN) {
    return NextResponse.json({ error: 'You’ve asked a lot of new questions. Wait a few minutes and try again.' }, { status: 429 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      try {
        if (saved) {
          for (const step of saved.steps) send({ type: 'step', step });
          send({ type: 'done', answer: saved });
        } else {
          const answer = await runAgent(picture, question, DEMO_ASOF, (step) => send({ type: 'step', step }));
          send({ type: 'done', answer });
          if (answer.plan) await saveAnswer(viewer.memberId, hash, answer).catch((err: Error) => console.warn('Could not save agent answer:', err.message));
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        send({ type: 'error', error: status === 429 ? 'The AI coach is busy right now. Try again in a few seconds.' : 'The AI coach couldn’t finish. Try again, or use the fix plan above.' });
        console.warn('Agent run failed:', status ?? '', (err as Error).message);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
