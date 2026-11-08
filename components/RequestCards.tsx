'use client';

// Pending friend / household requests sent to me, with Accept / Decline.

import { useState } from 'react';
import type { ConnectionRequest } from '@/lib/types';
import { sendConnectionChange } from '@/lib/useConnections';
import { Eyebrow, btn, btn2 } from './ui';

export function RequestCards({ requests }: { requests: ConnectionRequest[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (id: string, accept: boolean) => {
    setBusy(id);
    setError(await sendConnectionChange(`/api/friends/${id}`, 'PATCH', { accept }));
    setBusy(null);
  };

  return (
    <>
      {requests.map((r) => (
        <section key={r.id} aria-label="Request" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#BFD0F5] bg-accent-bg p-6">
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-[#1A3E9E]">{r.kind === 'household' ? 'Household invite' : 'Friend request'}</Eyebrow>
            <strong className="text-[19px]">
              {r.kind === 'household'
                ? `${r.from.name} (@${r.from.username}) invited you to their household as ${r.role === 'spouse' ? 'a spouse' : 'a dependent'}`
                : `${r.from.name} (@${r.from.username}) wants to be friends`}
            </strong>
            <span className="text-sm text-ink-2">
              {r.kind === 'household'
                ? 'Household members can see each other’s accounts and plan together.'
                : 'Friends can invite each other to huddles. They never see your balances, bills or score.'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn2} disabled={busy === r.id} onClick={() => void answer(r.id, false)}>
              Decline
            </button>
            <button type="button" className={btn} disabled={busy === r.id} onClick={() => void answer(r.id, true)}>
              Accept
            </button>
          </div>
        </section>
      ))}
      {error && (
        <p role="alert" className="m-0 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </>
  );
}
