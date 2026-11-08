'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { btn, input } from '@/components/ui';
import { Field } from '@/components/AuthShell';
import { cleanUsername, emailError, nameError, passwordError, safeNext, usernameError } from '@/lib/auth/validate';

type Fields = 'name' | 'username' | 'email' | 'password';

function Hint({ tone, children }: { tone: 'good' | 'bad' | 'muted'; children: string }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted';
  return <p className={`m-0 text-[13px] ${color}`} aria-live="polite">{children}</p>;
}

export function SignupForm({ returnTo = '/' }: { returnTo?: string }) {
  const [form, setForm] = useState<Record<Fields, string>>({ name: '', username: '', email: '', password: '' });
  const [serverError, setServerError] = useState<{ field?: string; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ name: string; available: boolean } | null>(null);

  const username = cleanUsername(form.username);
  const usernameLower = username.toLowerCase();
  const localUsernameError = username ? usernameError(username) : null;

  // Check availability while typing (debounced). setState only happens in the async callback.
  useEffect(() => {
    if (!username || localUsernameError) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/users/check?username=${encodeURIComponent(username)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { available?: boolean }) => setCheck({ name: username.toLowerCase(), available: Boolean(d.available) }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [username, localUsernameError]);

  const usernameTaken = check?.name === usernameLower && !check.available;
  const usernameHint = !username ? (
    <Hint tone="muted">3–20 letters, numbers, _ or . — friends add you by this.</Hint>
  ) : localUsernameError ? (
    <Hint tone="bad">{localUsernameError}</Hint>
  ) : check?.name !== usernameLower ? (
    <Hint tone="muted">Checking…</Hint>
  ) : check.available ? (
    <Hint tone="good">{`@${username} is available`}</Hint>
  ) : (
    <Hint tone="bad">That username is taken.</Hint>
  );

  const clientErrors = {
    name: nameError(form.name.trim()),
    username: usernameError(username),
    email: emailError(form.email.trim()),
    password: passwordError(form.password),
  };
  const canSubmit = !busy && !usernameTaken && Object.values(clientErrors).every((e) => !e);

  const set = (field: Fields) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (serverError?.field === field) setServerError(null);
  };
  const fieldError = (field: Fields) => (serverError?.field === field ? <Hint tone="bad">{serverError.error}</Hint> : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, username }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!res.ok) {
        setServerError({ field: data.field, error: data.error || 'Couldn’t create your account. Try again.' });
        setBusy(false);
        return;
      }
      window.location.assign(safeNext(returnTo));
    } catch {
      setServerError({ error: 'Couldn’t reach the server. Try again.' });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="m-0 text-sm text-muted">Your account starts with synthetic Nessie demo finances. Setup may take a moment.</p>
      <Field label="Name" htmlFor="name" hint={fieldError('name')}>
        <input id="name" className={input} autoComplete="name" value={form.name} onChange={set('name')} required />
      </Field>
      <Field label="Username" htmlFor="username" hint={fieldError('username') ?? usernameHint}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">@</span>
          <input
            id="username"
            className={`${input} pl-7`}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={set('username')}
            aria-invalid={Boolean(localUsernameError || usernameTaken)}
            required
          />
        </div>
      </Field>
      <Field label="Email" htmlFor="email" hint={fieldError('email')}>
        <input id="email" type="email" className={input} autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} required />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint={fieldError('password') ?? <Hint tone="muted">At least 8 characters.</Hint>}
      >
        <input id="password" type="password" className={input} autoComplete="new-password" value={form.password} onChange={set('password')} required />
      </Field>
      {serverError && !serverError.field && (
        <p role="alert" className="m-0 rounded-[10px] bg-bad-bg px-3 py-2.5 text-sm text-bad">
          {serverError.error}
        </p>
      )}
      <button type="submit" className={`${btn} w-full`} disabled={!canSubmit}>
        {busy ? 'Creating account and demo finances…' : 'Create account'}
      </button>
    </form>
  );
}
