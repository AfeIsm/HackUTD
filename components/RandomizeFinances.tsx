'use client';

import { useState } from 'react';
import type { HealthPayload } from '@/lib/services/health';
import { btn2 } from './ui';

export function RandomizeFinances({ disabled, onComplete }: { disabled: boolean; onComplete: (payload: HealthPayload) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  async function randomize() {
    if (busy || disabled) return;
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/demo/randomize', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not randomize demo finances.');
      onComplete(data);
      setRequestId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not randomize demo finances.');
    } finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-2">
    <button type="button" className={btn2} disabled={disabled || busy} onClick={() => void randomize()}>
      {busy ? 'Generating Nessie demo finances…' : requestId ? 'Retry demo randomization' : 'Randomize demo finances'}
    </button>
    <span className="text-xs text-muted">Generates new synthetic accounts, income, bills and spending. Previous account purchases and goals stay with the old demo accounts.</span>
    {error && <p role="alert" className="m-0 text-sm text-bad">{error}</p>}
  </div>;
}
