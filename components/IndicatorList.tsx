import type { Indicator } from '@/lib/types';
import { StatusPill } from './ui';

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
