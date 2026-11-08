'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { SignupForm } from '@/components/SignupForm';
import { useWallet } from './WalletContext';

export function LoginPanel() {
  const w = useWallet();
  return w.loginOpen ? <Panel key={w.loginMode} /> : null;
}
function Panel() {
  const w = useWallet();
  const params = useSearchParams();
  const [mode, setMode] = useState(w.loginMode);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = params.get('next') || w.loginNext;
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el?.showModal();
    return () => { el?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return (
    <dialog ref={dialog} className="login-panel" aria-labelledby="login-title" aria-describedby="login-desc" onCancel={e => { e.preventDefault(); w.closeLogin(); }}>
      <div className="login-tab" aria-hidden="true" />
      <h2 id="login-title" className="font-display text-2xl">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p id="login-desc" className="mt-1 text-sm text-muted">{mode === 'login' ? 'Show your member ID to open the wallet.' : 'Pick a unique username — friends add you by it.'}</p>
      <div className="mt-5">{mode === 'login' ? <LoginForm returnTo={returnTo} /> : <SignupForm returnTo={returnTo} />}</div>
      <button type="button" className="mt-4 w-full text-center text-sm font-semibold underline-offset-4 hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
      </button>
      <button type="button" className="login-close" aria-label="Close login" onClick={w.closeLogin}>×</button>
    </dialog>
  );
}
