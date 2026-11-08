import type { Indicator } from '@/lib/types';
import { StatusPill } from './ui';

export function IndicatorList({ indicators }: { indicators: Indicator[] }) {
  return (
    <div className="flex flex-col">
      {indicators.map((i) => {
        const earned = (i.points * i.weight) / 100;
        return (
          <div key={i.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#EFEFEA] py-3.5">
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-[15px]">{i.label}</strong>
                <span className="text-xs text-muted">{i.weight}% of score</span>
              </div>
              <span className="text-[13px] leading-snug text-muted">{i.explanation}</span>
            </div>
            <span className="min-w-[92px] text-right font-display text-xl font-semibold">{i.display}</span>
            <StatusPill status={i.status} className="min-w-[72px] justify-center" />
            <span className="min-w-16 text-right text-[13px] text-muted">
              +{earned % 1 ? earned.toFixed(1) : earned} pts
            </span>
          </div>
        );
      })}
    </div>
  );
}
