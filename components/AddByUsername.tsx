'use client';

// "Add by username" form: friends (Friends page) or household members (Household page).

import { useState } from 'react';
import { cleanUsername, usernameError } from '@/lib/auth/validate';
import { sendConnectionChange } from '@/lib/useConnections';
import { btn, input } from './ui';

export function AddByUsername({ kind, title, help }: { kind: 'friend' | 'household'; title: string; help: string }) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'spouse' | 'dependent'>('dependent');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const clean = cleanUsername(username);

  const submit = async () => {
    setBusy(true);
    const error = await sendConnectionChange('/api/friends', 'POST', { username: clean, kind, ...(kind === 'household' ? { role } : {}) });
    setNotice(error ? { ok: false, text: error } : { ok: true, text: `Request sent to @${clean}. They need to accept on their device.` });
    if (!error) setUsername('');
    setBusy(false);
  };

  return (
    <form
      aria-label={title}
      className={`${kind === 'household' ? 'household-invite' : 'paper-card'} min-w-0 flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="section-title font-display">{title}</h2>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Username
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-normal text-muted">@</span>
          <input
            className={`${input} pl-7`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="sam"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </label>
      {kind === 'household' && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Role
          <select className={input} value={role} onChange={(e) => setRole(e.target.value === 'spouse' ? 'spouse' : 'dependent')}>
            <option value="spouse">Spouse / partner</option>
            <option value="dependent">Dependent</option>
          </select>
        </label>
      )}
      <button type="submit" className={`${kind === 'household' ? 'hack-create rounded-md font-semibold' : btn} w-full disabled:cursor-not-allowed disabled:opacity-50`} disabled={busy || !clean || Boolean(usernameError(clean))}>
        {busy ? 'Sending…' : 'Send request'}
      </button>
      {notice && (
        <p role="status" className={`m-0 rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>
          {notice.text}
        </p>
      )}
      <p className="m-0 text-[13px] text-muted">{help}</p>
    </form>
  );
}
