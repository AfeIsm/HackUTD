'use client';

// Checks the amount when you leave the field, not on every keystroke: each new plan name can
// cost a real search. It only warns. Nobody is ever stopped from creating a huddle.

import { useRef, useState } from 'react';
import { parseMoney } from '@/lib/engine/money';
import type { BudgetCheck } from '@/lib/purchase/viability';

type State = { key: string; status: 'checking' | 'done'; check: BudgetCheck | null } | null;

export function useBudgetCheck(name: string, total: string, date: string, people: number) {
  const [saved, setSaved] = useState<State>(null);
  const latest = useRef('');
  const amount = parseMoney(total) ?? 0;
  const key = `${name.trim().toLowerCase()}|${amount}`;
  const check = () => {
    if (name.trim().length < 3 || amount <= 0 || latest.current === key) return;
    latest.current = key;
    setSaved({ key, status: 'checking', check: null });
    void fetch('/api/huddles/check-budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), amount, targetDate: date, people }) })
      .then((r) => (r.ok ? r.json() : { check: null }))
      .catch(() => ({ check: null }))
      .then((data: { check: BudgetCheck | null }) => { if (latest.current === key) setSaved({ key, status: 'done', check: data.check }); });
  };
  return { check, state: saved?.key === key ? saved : null }; // an edited amount hides the old answer
}

const TONE: Record<BudgetCheck['verdict'], string> = {
  tooLow: 'bg-bad-bg text-[#7A1712]', tight: 'bg-warn-bg text-warn', high: 'bg-warn-bg text-warn', ok: 'bg-good-bg text-[#0D5A2E]',
};

export function BudgetNote({ state }: { state: State }) {
  if (!state || (state.status === 'done' && !state.check)) return null;
  if (state.status === 'checking') return <p className="m-0 text-sm text-muted" aria-live="polite">Nemotron is checking real prices for this…</p>;
  const check = state.check as BudgetCheck;
  return (
    <p role="status" className={`m-0 rounded-xl px-4 py-3 text-[15px] leading-normal ${TONE[check.verdict]}`}>
      {check.message} <span className="text-xs opacity-80">Based on live listings.</span>
    </p>
  );
}
