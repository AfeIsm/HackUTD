'use client';

// Wraps the signed-in pages: waits for /api/auth/me, sends logged-out visitors to /login,
// and explains when an account has no money data yet (new sign-ups until step 6).

import { useEffect, type ReactNode } from 'react';
import { PEOPLE } from '@/lib/people';
import { logout, useMe } from '@/lib/useMe';
import { Card } from './ui';
import { btn2 } from './ui';

export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe();

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
  if (!memberId || !PEOPLE.some((p) => p.id === memberId && p.hasAccounts)) {
    return (
      <Card className="flex max-w-[560px] flex-col gap-3">
        <h1 className="m-0 text-[28px]">Welcome, {me.user.name}</h1>
        <p className="m-0 text-ink-2">
          Your account <strong>@{me.user.username}</strong> is set up, but it isn’t linked to any bank accounts yet, so
          there’s nothing to score.
        </p>
        <div>
          <button type="button" className={btn2} onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}
