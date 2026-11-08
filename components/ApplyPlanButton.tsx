'use client';

// "Apply this plan": the AI (or engine) proposes, the person approves. Moves free savings to
// checking as a real Nessie transfer and cancels the listed subscriptions, then re-scores.

import { useState } from 'react';
import { applyPlan } from '@/lib/applyPlan';
import type { HealthPayload } from '@/lib/services/health';
import { btn, btn2 } from './ui';

export function ApplyPlanButton({ plan, onApplied }: {
  plan: { cancel: string[]; moveSavingsToChecking: number | null };
  onApplied: (payload: HealthPayload, note: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const run = async (method: 'POST' | 'DELETE') => {
    setState('busy');
    setError(null);
    const r = await applyPlan(plan, method);
    if (!r.ok) { setError(r.error); setState(method === 'POST' ? 'idle' : 'done'); return; }
    setState(method === 'POST' ? 'done' : 'idle');
    onApplied(r.payload, r.note);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {state !== 'done' ? (
          <button type="button" className={btn} disabled={state === 'busy'} onClick={() => void run('POST')}>
            {state === 'busy' ? 'Applying…' : 'Apply this plan'}
          </button>
        ) : (
          <button type="button" className={btn2} onClick={() => void run('DELETE')}>Undo</button>
        )}
        <span className="text-xs text-muted">Nothing happens until you click. Savings moves are sent to the bank (Nessie) as a real transfer.</span>
      </div>
      {error && <p role="alert" className="m-0 text-sm text-bad">{error}</p>}
    </div>
  );
}
