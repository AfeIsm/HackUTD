'use client';

// Locking only saves a promise. This is the one place a member chooses to actually send the money,
// so it always asks first and names the exact amount and account.

import { useState } from 'react';
import type { Participant } from '@/lib/huddles';
import { money } from '@/lib/format';
import { btn, btn2 } from './ui';

export function TransferNow({ mine, huddleName, sourceText, busy, onTransfer }: { mine: Participant; huddleName: string; sourceText: string; busy: boolean; onTransfer: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const amount = money(mine.pledge ?? 0);
  if (mine.transfer?.status === 'sent') {
    return <p className="m-0 rounded-xl bg-good-bg p-4 text-[15px] font-semibold text-[#0D5A2E]">Transferred {amount} from {sourceText} to {huddleName}. Your balance has been updated.</p>;
  }
  if (confirming) {
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
        <strong className="text-[15px]">Send {amount} from {sourceText} to {huddleName}?</strong>
        <span className="text-sm text-ink-2">This takes the money out of your balance now.</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => void onTransfer().then(() => setConfirming(false))}>{busy ? 'Sending…' : 'Yes, transfer it'}</button>
          <button type="button" className={btn2} disabled={busy} onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      </div>
    );
  }
  return <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => setConfirming(true)}>Transfer {amount} now</button>;
}
