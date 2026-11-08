'use client';

import { useState } from 'react';
import type { FinancialPicture } from '@/lib/types';
import { money } from '@/lib/format';
import { freeSavings } from '@/lib/engine/source';
import { btn, input } from './ui';

export interface NewPurchase {
  merchant: string;
  amount: number;
  from: 'checking' | 'free' | string; // 'free' = savings not set aside; otherwise a goal id
}

export function AddPurchase({ picture, onAdd }: { picture: FinancialPicture; onAdd: (p: NewPurchase) => void }) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('checking');
  const checking = picture.accounts.filter((a) => a.type === 'Checking').reduce((s, a) => s + a.balance, 0);
  const value = Number(amount);
  const valid = merchant.trim().length > 0 && value > 0;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({ merchant: merchant.trim(), amount: Math.round(value * 100) / 100, from });
        setMerchant('');
        setAmount('');
      }}
    >
      <label className="flex flex-[2_1_180px] flex-col gap-1.5 text-sm font-semibold">
        Where
        <input className={input} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Best Buy" />
      </label>
      <label className="flex flex-[1_1_110px] flex-col gap-1.5 text-sm font-semibold">
        Amount
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="180.00" />
      </label>
      <label className="flex flex-[2_1_220px] flex-col gap-1.5 text-sm font-semibold">
        Paid from
        <select className={input} value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="checking">Checking · {money(checking)}</option>
          <option value="free">Savings, not set aside · {money(freeSavings(picture))}</option>
          {picture.goals.map((g) => (
            <option key={g.id} value={g.id}>
              Savings: {g.name} · {money(g.amount)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={btn} disabled={!valid}>
        Add purchase
      </button>
    </form>
  );
}
