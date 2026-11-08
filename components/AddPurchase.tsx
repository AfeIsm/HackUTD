'use client';
import { useState } from 'react';
import type { FinancialPicture } from '@/lib/types';
import { fundingOptions } from '@/lib/fundingOptions';
import { parseMoney } from '@/lib/engine/money';
import { checkSource } from '@/lib/engine/source';
import { btn, input } from './ui';

export interface NewPurchase { merchant: string; amount: number; sourceAccountId: string; goalId?: string }
export function AddPurchase({ picture, onAdd }: { picture: FinancialPicture; onAdd: (p: NewPurchase) => void }) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [error, setError] = useState('');
  const options = fundingOptions(picture);
  const selected = options.find((o) => o.value === from) ?? options[0];
  const value = parseMoney(amount);
  const valid = merchant.trim().length > 0 && value !== null && value > 0 && !!selected;
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
      e.preventDefault();
      if (!valid || value === null) return;
      const check = checkSource(picture, value, selected.sourceAccountId, selected.goalId);
      const account = picture.accounts.find((a) => a.id === selected.sourceAccountId)!;
      if (!check.valid || value > account.balance - picture.reservations.filter((r) => r.sourceAccountId === account.id).reduce((s, r) => s + r.amount, 0)) { setError(check.missingInputs.join(' ') || 'This account has insufficient funds.'); return; }
      onAdd({ merchant: merchant.trim(), amount: value, sourceAccountId: selected.sourceAccountId, goalId: selected.goalId });
      setMerchant(''); setAmount(''); setError('');
    }}>
      <label className="flex flex-[2_1_180px] flex-col gap-1.5 text-sm font-semibold">Where
        <input className={input} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Best Buy" />
      </label>
      <label className="flex flex-[1_1_110px] flex-col gap-1.5 text-sm font-semibold">Amount
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="180.00" />
      </label>
      <label className="flex flex-[2_1_220px] flex-col gap-1.5 text-sm font-semibold">Paid from
        <select className={input} value={selected?.value ?? ''} onChange={(e) => setFrom(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button type="submit" className={btn} disabled={!valid}>Add purchase</button>
      {error && <p role="alert" className="w-full text-bad">{error}</p>}
    </form>
  );
}
