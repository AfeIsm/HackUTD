'use client';

// Under the Can I buy answer: is the price realistic, and what else could you buy instead?
// Each option's verdict comes from the same engine as the answer above it, on this device.

import { useRef, useState } from 'react';
import type { AgentStep, FinancialPicture } from '@/lib/types';
import type { BuyEvent, BuyQuestion, BuyResult } from '@/lib/agent/buyOptions';
import type { Proposal } from '@/lib/purchase/types';
import type { BudgetCheck } from '@/lib/purchase/viability';
import { canAfford, fitsBudget } from '@/lib/engine/afford';
import { shortDate } from '@/lib/format';
import { DEMO_ASOF } from '@/lib/people';
import { BudgetNote } from './BudgetCheck';
import { ProposalCard, SearchSteps } from './PurchasePanel';
import { Eyebrow, Pill } from './ui';

interface State {
  key: string;
  check: BudgetCheck | null | undefined; // undefined = still checking
  steps: AgentStep[];
  result: BuyResult | null;
  error: string | null;
}

export function useBuyOptions() {
  const [state, setState] = useState<State | null>(null);
  const current = useRef<AbortController | null>(null);

  const start = async (key: string, q: BuyQuestion) => {
    current.current?.abort();
    const abort = new AbortController();
    current.current = abort;
    setState({ key, check: undefined, steps: [], result: null, error: null });
    const apply = (e: BuyEvent) => setState((s) => {
      if (!s || s.key !== key) return s;
      if (e.type === 'check') return { ...s, check: e.check };
      if (e.type === 'step') return { ...s, steps: [...s.steps, e.step] };
      if (e.type === 'done') return { ...s, result: e.result };
      return { ...s, check: s.check ?? null, error: e.error };
    });
    try {
      const res = await fetch('/api/buy/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q), signal: abort.signal });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        apply({ type: 'error', error: data.error ?? 'The price search hit a problem. Try again.' });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as BuyEvent);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') apply({ type: 'error', error: 'The price search hit a problem. Try again.' });
    }
  };
  return { state, start };
}

function OptionVerdict({ p, picture, q }: { p: Proposal; picture: FinancialPicture; q: BuyQuestion }) {
  const r = canAfford(picture, { ...q, label: p.title, cost: p.total }, DEMO_ASOF);
  const prefix = p.kind === 'rental' ? 'The stay alone: ' : '';
  const score = r.scoreBefore === r.scoreAfter ? `score stays ${r.scoreAfter}` : `score ${r.scoreBefore} → ${r.scoreAfter}`;
  if (r.verdict === 'yes') return <Pill className="self-start bg-good-bg text-good">{prefix}Yes, {score}</Pill>;
  if (r.verdict === 'yesIf') return <Pill className="self-start bg-warn-bg text-warn">{prefix}Yes{r.readyDate ? ` after ${shortDate(r.readyDate)}` : ', with a wait'}</Pill>;
  if (fitsBudget(r)) return <Pill className="self-start bg-warn-bg text-warn">{prefix}You can pay for it, {score}</Pill>;
  return <Pill className="self-start bg-bad-bg text-bad">{prefix}Not right now</Pill>;
}

export function BuyOptions({ state, picture, question }: { state: State; picture: FinancialPicture; question: BuyQuestion }) {
  const { check, steps, result, error } = state;
  const running = !result && !error;
  return (
    <section aria-label="Price check and other options" className="paper-card flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Eyebrow>Price check and other options · Nemotron</Eyebrow>
        <p className="m-0 text-sm text-ink-2">Real listings for this item, tested against the account you picked.</p>
      </div>
      <BudgetNote state={{ key: state.key, status: check === undefined ? 'checking' : 'done', check: check ?? null }} />
      {steps.length > 0 && <SearchSteps steps={steps} running={running} />}
      {running && steps.length === 0 && <p className="m-0 text-sm text-ink-2" aria-live="polite">Nemotron is starting…</p>}
      {error && <p role="alert" className="m-0 rounded-xl bg-bad-bg px-4 py-3 text-sm text-[#7A1712]">{error}</p>}
      {result?.proposals.some((p) => p.demo) && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">The live search wasn’t available, so results marked Demo are not real prices or listings.</p>}
      {result?.noSolution && <p className="m-0 rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">{result.noSolution}</p>}
      {result?.summary && <p className="m-0 text-[15px]">{result.summary}</p>}
      {result?.proposals.map((p) => (
        <ProposalCard key={p.id} p={{ ...p, fundingGap: null }}>
          <OptionVerdict p={p} picture={picture} q={question} />
        </ProposalCard>
      ))}
    </section>
  );
}
