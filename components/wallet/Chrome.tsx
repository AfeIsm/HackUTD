'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMe } from '@/lib/useMe';
import { useWallet } from './WalletContext';

export function Chrome() {
  const me = useMe();
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Couldn’t log out. Try again.');
      // Never let an interrupted animation leave someone on a logged-out page.
      await Promise.race([w.closeForLogout(), new Promise((done) => setTimeout(done, 3000))]);
      // A full reload discards all previous-user caches before opening another session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    } catch {
      setError('Couldn’t log out. Try again.'); setBusy(false);
    }
  }
  return (
    <header className="chrome">
      <Link href="/" className="chrome-brand" aria-label="Wallet Whisperer home" onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault(); w.backToWallet();
      }}>
        {/* The approved image is stored locally, independent of Lovable. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wallet/logo.png" alt="Wallet Whisperer" width={56} height={56} />
      </Link>
      {me.status === 'in' && <div className="flex items-center gap-2">
        {error && <span role="alert" className="rounded-lg bg-bad-bg p-2 text-sm text-bad">{error}</span>}
        <button type="button" className="chrome-logout" disabled={busy} onClick={() => void signOut()}>{busy ? 'Logging out…' : 'Log out'}</button>
      </div>}
    </header>
  );
}
