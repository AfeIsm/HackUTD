'use client';

// "Ask the coach": you type a goal in your own words, Nemotron plans and calls our engine tools,
// and every step streams in live. The final plan's numbers are re-scored by the engine on the
// server; Nemotron only chooses what to try and explains it (it may not state numbers).

import { useState } from 'react';
import type { AgentStep } from '@/lib/types';
import type { AgentAnswer } from '@/lib/agent/loop';
import { Card, Eyebrow, StatusPill, btn, input } from './ui';

const EXAMPLES = [
  'Get me to green. I won’t cancel Spotify.',
  'Can we afford a $1,200 Orlando trip on March 1?',
  'Which subscriptions should I cut first?',
];

const STEP_ICON: Record<AgentStep['type'], string> = { plan: '🧭', tool: '🔧', result: '↺', final: '✓' };

export function AgentPanel() {
  const [question, setQuestion] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || running) return;
    setQuestion(text);
    setSteps([]);
    setAnswer(null);
    setError(null);
    setRunning(true);
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Something went wrong (${res.status}).`);
        return;
      }
      // NDJSON: one JSON object per line, sent as each step happens.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { type: 'step'; step: AgentStep } | { type: 'done'; answer: AgentAnswer } | { type: 'error'; error: string };
          if (msg.type === 'step') setSteps((s) => [...s, msg.step]);
          else if (msg.type === 'done') setAnswer(msg.answer);
          else setError(msg.error);
        }
      }
    } catch {
      setError('Couldn’t reach the server. Try again.');
    } finally {
      setRunning(false);
    }
  }

  const plan = answer?.plan;
  return (
    <Card label="Ask the coach" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Eyebrow>Ask the coach · Nemotron agent</Eyebrow>
        <h2 className="m-0 text-xl">Tell it your goal in your own words</h2>
        <p className="m-0 text-[14px] text-ink-2">It checks your real accounts, tests options with our scoring engine, and proposes a plan. Every number is calculated by the engine, not the AI.</p>
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <label htmlFor="coach-q" className="sr-only">Your question</label>
        <input id="coach-q" className={`${input} min-w-0 flex-[1_1_320px]`} value={question} maxLength={400} disabled={running}
          placeholder="e.g. Can we do Orlando in March if I drop the gym but keep Spotify?" onChange={(e) => setQuestion(e.target.value)} />
        <button type="submit" className={btn} disabled={running || question.trim().length < 3}>{running ? 'Working…' : 'Ask'}</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" disabled={running} onClick={() => void ask(ex)}
            className="min-h-9 cursor-pointer rounded-full border border-line bg-soft px-3 text-[13px] font-semibold text-ink-2 hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-60">
            {ex}
          </button>
        ))}
      </div>

      {steps.length > 0 && (
        <ol aria-label="What the agent did" aria-live="polite" className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-soft p-3 text-[14px]">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden="true" className="w-5 shrink-0 text-center">{STEP_ICON[s.type]}</span>
              <span className="min-w-0">
                {s.tool && <code className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[12px] text-muted">{s.tool}</code>}
                {s.text}
              </span>
            </li>
          ))}
          {running && <li className="pl-7 text-muted">Working…</li>}
        </ol>
      )}

      {error && <p role="alert" className="m-0 rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}

      {plan && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <strong className="text-[17px]">{plan.summary}</strong>
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              <span>{plan.scoreBefore}</span><StatusPill status={plan.statusBefore} />
              <span aria-hidden="true">→</span><span className="sr-only">to</span>
              <span>{plan.scoreAfter}</span><StatusPill status={plan.statusAfter} />
            </div>
          </div>
          {plan.actions.length > 0 ? (
            <ul className="m-0 flex flex-col gap-1 pl-5 text-[15px]">
              {plan.actions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          ) : <p className="m-0 text-[15px]">No change needed, or nothing tested works yet.</p>}
          {plan.explanation && <p className="m-0 text-[14px] text-ink-2"><span className="font-semibold">Nemotron:</span> {plan.explanation}</p>}
          {plan.notGreen.length > 0 && <p className="m-0 text-[13px] text-warn">Still not green after this: {plan.notGreen.join(' · ')}</p>}
          <p className="m-0 text-xs text-muted">
            Score re-checked by our engine{answer?.cached ? ' · saved answer (same question, same data)' : ''} · {answer?.model}
          </p>
        </div>
      )}
      {answer && !plan && answer.message && <p className="m-0 rounded-xl border border-line px-4 py-3 text-[15px]">{answer.message}</p>}
    </Card>
  );
}
