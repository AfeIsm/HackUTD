'use client';

// Set money aside in savings for something specific. The health score and Nemotron both read these.

import { useState } from 'react';
import type { FinancialPicture } from '@/lib/types';
import { parseMoney } from '@/lib/engine/money';
import { freeSavings } from '@/lib/engine/source';
import { money0 } from '@/lib/format';
import { Card, btn, input } from './ui';

export function SavingsGoals({ picture, busy, onAdd, onRemove }: {
  picture: FinancialPicture;
  busy: boolean;
  onAdd: (goal: { name: string; amount: number; accountId: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const savings = picture.accounts.filter((a) => a.type === 'Savings' && a.ownerMemberId === picture.memberId);
  const account = savings.find((a) => a.id === accountId) ?? savings[0];
  const free = account ? freeSavings(picture, account.id) : 0;
  const value = parseMoney(amount);
  const tooMuch = value !== null && value > free;
  const valid = name.trim().length > 0 && value !== null && value > 0 && !tooMuch && !!account;

  return (
    <Card label="Savings goals" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-xl">Savings goals</h2>
        <p className="m-0 text-[13px] leading-normal text-muted">
          Set savings aside for something specific. It stays in your account, but no longer counts as your emergency cushion, so your score can change.
        </p>
      </div>

      {picture.goals.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {picture.goals.map((g) => (
            <li key={g.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-[#EFEFEA] py-1.5 text-[15px]">
              <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
              <span className="font-display font-semibold">{money0(g.amount)}</span>
              {g.id.startsWith('goal-') && (
                <button type="button" disabled={busy} onClick={() => onRemove(g.id)} aria-label={`Remove ${g.name}`}
                  className="cursor-pointer border-0 bg-transparent p-2 text-xs font-semibold text-accent">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {account ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (!valid || value === null) return;
          onAdd({ name: name.trim(), amount: value, accountId: account.id });
          setName(''); setAmount('');
        }}>
          <label className="flex flex-[2_1_180px] flex-col gap-1.5 text-sm font-semibold">Goal
            <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Spring break" />
          </label>
          <label className="flex flex-[1_1_110px] flex-col gap-1.5 text-sm font-semibold">Set aside
            <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="300" />
          </label>
          {savings.length > 1 && (
            <label className="flex flex-[2_1_180px] flex-col gap-1.5 text-sm font-semibold">From
              <select className={input} value={account.id} onChange={(e) => setAccountId(e.target.value)}>
                {savings.map((a) => <option key={a.id} value={a.id}>{a.nickname}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className={btn} disabled={busy || !valid}>Add goal</button>
          <p className={`m-0 w-full text-xs ${tooMuch ? 'text-bad' : 'text-muted'}`}>{money0(free)} of your savings is free to set aside.</p>
        </form>
      ) : (
        <p className="m-0 text-sm text-ink-2">You need a savings account to set a goal.</p>
      )}
    </Card>
  );
}
