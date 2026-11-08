'use client';

import { useState, type FormEvent } from 'react';
import { btn, input } from '@/components/ui';
import { Field } from '@/components/AuthShell';
import { safeNext } from '@/lib/auth/validate';

export function LoginForm({ returnTo = '/' }: { returnTo?: string }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Couldn’t log in. Try again.');
      // Full page load so every page starts fresh as the new user.
      window.location.assign(safeNext(returnTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t log in. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Username or email" htmlFor="login">
        <input id="login" className={input} autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" type="password" className={input} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && (
        <p role="alert" className="m-0 rounded-[10px] bg-bad-bg px-3 py-2.5 text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" className={`${btn} w-full`} disabled={busy || !login || !password}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
