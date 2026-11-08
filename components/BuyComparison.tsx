'use client';

import { useState } from 'react';
import type { FinancialPicture } from '@/lib/types';
import type { BuyQuestion } from '@/lib/agent/buyOptions';
import { ComparisonDialog } from './ComparisonDialog';
import { btn2 } from './ui';
import './BuyComparison.css';

export function BuyComparison({ picture, purchase }: { picture: FinancialPicture; purchase: BuyQuestion }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`${btn2} buy-compare-trigger`} onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span aria-hidden="true">✦</span> Compare scenarios with Nemotron <span aria-hidden="true">↗</span>
    </button>
    {open && <ComparisonDialog picture={picture} purchase={purchase} onClose={() => setOpen(false)} />}
  </>;
}
