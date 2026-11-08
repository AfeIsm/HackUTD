import type { Indicator, IndicatorKey } from '@/lib/types';
import { COVERED_DAYS } from '@/lib/engine/health';
import { StatusPill, TONE } from './ui';

type Tier = 'green' | 'yellow' | 'red';
const TIERS: Tier[] = ['green', 'yellow', 'red'];

const FORMULAS: Record<IndicatorKey, { formula: string } & Record<Tier, string>> = {
  essentialBills: {
    formula: 'Lowest projected checking balance over 30 days ÷ (monthly essential costs ÷ 30) = days covered',
    green: `${COVERED_DAYS} days or more`, yellow: `0 to under ${COVERED_DAYS} days`, red: 'Balance below $0',
  },
  cushion: {
    formula: 'Unallocated savings ÷ monthly essential costs = months covered',
    green: '3 months or more', yellow: '1 to under 3 months', red: 'Under 1 month',
  },
  debtLoad: {
    formula: '(Monthly loan payments + credit card minimums) ÷ monthly income',
    green: 'Under 20%', yellow: '20% to 36%', red: 'Over 36%',
  },
  savingsProtection: {
    formula: 'Unallocated savings used for spending in the last 30 days ÷ savings before that spending',
    green: 'None used', yellow: 'Under 10%', red: '10% or more',
  },
  nonEssential: {
    formula: 'Detected nonessential subscriptions per month ÷ monthly income',
    green: 'Under 5%', yellow: '5% to 10%', red: 'Over 10%',
  },
};

export function IndicatorList({ indicators }: { indicators: Indicator[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {indicators.map((i) => {
        const earned = ((i.points ?? 0) * i.weight) / 100;
        return (
          <li key={i.key} className="border-t border-line">
            <details className="group/indicator">
              <summary className="grid min-h-16 list-none grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 rounded-md py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <strong className="text-[15px] font-semibold">{i.label}</strong>
                  <span className="font-display text-lg font-semibold tabular-nums sm:text-right">
                    {i.points === null ? '—' : i.display}
                  </span>
                </span>
                <StatusPill status={i.status} className="min-w-[80px] justify-center" />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted group-open/indicator:rotate-180">
                  <path d="m6 9 6 6 6-6" />
                </svg>
                <span className="sr-only">Details</span>
              </summary>
              <div className="pb-4">
                <p className="m-0 text-sm leading-relaxed text-ink-2">{i.explanation}</p>
                <div className="mt-3 rounded-lg bg-soft p-3 text-[13px]">
                  <p className="m-0 font-semibold text-ink">How it’s calculated</p>
                  <p className="m-0 mt-1 leading-relaxed text-ink-2">{FORMULAS[i.key].formula}</p>
                  <dl className="m-0 mt-2.5 grid gap-1.5 sm:grid-cols-3">
                    {TIERS.map((tier) => (
                      <div key={tier} className={`rounded-md px-2.5 py-1.5 ${i.status === tier ? TONE[tier].pill : ''}`}>
                        <dt className={i.status === tier ? 'font-semibold' : 'font-semibold text-muted'}>{TONE[tier].label}</dt>
                        <dd className={`m-0 ${i.status === tier ? '' : 'text-ink-2'}`}>{FORMULAS[i.key][tier]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <p className="mb-0 mt-2 text-xs text-muted">
                  {i.weight}% of your score · {i.points === null ? 'Needs input to calculate points' : `${earned % 1 ? earned.toFixed(1) : earned} of ${i.weight} possible points`}
                </p>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
