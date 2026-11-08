'use client';

import { useState, type FormEvent } from 'react';
import { sendConnectionChange } from '@/lib/useConnections';
import { Card, btn, input } from './ui';

export function AddDependent() {
  const [name, setName] = useState('');
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    const key = requestId || crypto.randomUUID();
    setRequestId(key);
    setBusy(true);
    const message = await sendConnectionChange('/api/dependents', 'POST', { name, requestId: key });
    setError(message);
    setBusy(false);
    if (!message) { setName(''); setRequestId(''); }
  }
  return <Card className="flex max-w-[560px] flex-col gap-3">
    <h2 className="m-0 text-[22px]">Add a managed dependent</h2>
    <p className="m-0 text-sm text-muted">For a dependent without a login. Creates separate synthetic checking, savings and income for the demo. Invite someone with an account by username instead.</p>
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="dependent-name">Dependent name</label>
      <input id="dependent-name" className={input} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} disabled={busy || Boolean(requestId)} required />
      {error && <p role="alert" className="m-0 text-bad">{error}</p>}
      <button className={btn} disabled={busy || !name.trim()}>{busy ? 'Setting up demo finances…' : requestId ? 'Retry setup' : 'Add dependent'}</button>
    </form>
  </Card>;
}
