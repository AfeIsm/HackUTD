'use client';

// Wraps the signed-in pages: waits for /api/auth/me, sends logged-out visitors to /login,
// and explains when an account has no money data yet (new sign-ups until step 6).

import { useEffect, useState, type ReactNode } from 'react';
import { logout, useMe } from '@/lib/useMe';
import { Card } from './ui';
import { btn2 } from './ui';

export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function setup() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup could not finish.');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup could not finish.');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (me.status === 'out') {
      // Full reload on purpose: wipes the previous user's cached data from memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [me.status]);

  if (me.status === 'loading' || me.status === 'out') {
    return <p className="m-0 text-muted">{me.status === 'out' ? 'Taking you to log in…' : 'Loading…'}</p>;
  }
  if (me.status === 'error') {
    return (
      <Card>
        <p className="m-0 text-ink-2">Couldn’t check your login. Refresh to try again.</p>
      </Card>
    );
  }
  const memberId = me.user.memberId;
  if (!memberId) {
    return (
      <Card className="flex max-w-[560px] flex-col gap-3">
        <h1 className="m-0 text-[28px]">Welcome, {me.user.name}</h1>
        <p className="m-0 text-ink-2">
          Your account <strong>@{me.user.username}</strong> is set up, but it isn’t linked to any bank accounts yet, so
          there’s nothing to score.
        </p>
        <p className="m-0 text-sm text-muted">Set up synthetic checking, savings, payroll and bills for your demo dashboard.</p>
        {error && <p role="alert" className="m-0 text-bad">{error}</p>}
        <button type="button" className={btn2} disabled={busy} onClick={() => void setup()}>
          {busy ? 'Setting up demo finances…' : 'Set up demo finances'}
        </button>
        <div>
          <button type="button" className={btn2} onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </Card>
    );
  }
  return <>{memberId.startsWith('user-') && <p className="m-0 text-sm text-muted">Demo finances · synthetic Nessie banking data · assessment date November 7, 2026</p>}{children}</>;
}
