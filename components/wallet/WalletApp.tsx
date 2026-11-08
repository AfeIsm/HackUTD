'use client';

import { useEffect, type ReactNode } from 'react';
import { useMe } from '@/lib/useMe';
import type { PublicUser } from '@/lib/types';
import { WalletProvider } from './WalletContext';
import { WalletScene } from './WalletScene';
import { Chrome } from './Chrome';
import { FlightLayer } from './FlightLayer';
import { LoginPanel } from './LoginPanel';

export function WalletApp({ children }: { children: ReactNode }) {
  const me = useMe();
  useEffect(() => {
    if (me.status !== 'in' && me.status !== 'out') return;
    const controller = new AbortController();
    let checking = false;
    const checkSession = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
        if (res.status !== 401 && !res.ok) return;
        const data = res.ok ? await res.json() as { user: PublicUser } : null;
        const current = me.status === 'in' ? me.user.id : null;
        if ((data?.user.id ?? null) !== current) window.location.reload();
      } catch { /* A failed check does not pretend the viewer signed out. */ }
      finally { checking = false; }
    };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', restore);
    window.addEventListener('focus', checkSession);
    document.addEventListener('visibilitychange', checkSession);
    return () => {
      controller.abort();
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('focus', checkSession);
      document.removeEventListener('visibilitychange', checkSession);
    };
  }, [me]);
  return (
    <WalletProvider>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Chrome />
      <WalletScene />
      <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
      <FlightLayer />
      <LoginPanel />
      {me.status === 'error' && <p role="alert" className="wallet-session-note">Couldn’t check your session. <button className="btn-ghost" onClick={() => window.location.reload()}>Try again</button></p>}
    </WalletProvider>
  );
}
