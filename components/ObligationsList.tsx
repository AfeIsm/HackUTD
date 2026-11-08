import { monthly } from '@/lib/engine/health';
import type { Obligation } from '@/lib/types';
import { cadenceLabel, money, money0, shortDate } from '@/lib/format';

const ORIGIN_LABEL: Record<Obligation['origin'], string> = { cardMinimum: 'Confirmed minimum', bill: 'bill', loan: 'loan', detected: 'detected' };

export function ObligationsList({
  obligations,
  onToggle,
}: {
  obligations: Obligation[];
  onToggle: (key: string) => void;
}) {
  const essentialMonthly = obligations.filter((o) => o.essential).reduce((s, o) => s + monthly(o), 0);
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-xl">Bills &amp; subscriptions</h2>
        <span className="text-[13px] text-muted">{money0(essentialMonthly)}/mo essential</span>
      </div>
      {obligations.length === 0 && <p className="py-3 text-muted">No bills or subscriptions yet.</p>}
      {obligations.map((o) => (
        <div key={o.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#EFEFEA] py-2.5">
          <div className="flex min-w-0 flex-[1_1_160px] flex-col">
            <span className="text-[15px] font-semibold">{o.name}</span>
            <span className="text-xs text-muted">
              {cadenceLabel(o.cadence)} · {shortDate(o.nextDate)} · {ORIGIN_LABEL[o.origin]}
            </span>
          </div>
          <span className="min-w-20 text-right text-[15px] font-semibold">{money(o.amount)}</span>
          <button
            type="button"
            onClick={() => onToggle(o.key)}
            aria-label={`${o.name} is ${o.essential ? 'essential' : 'non-essential'}. Change tag.`}
            className={`inline-flex min-h-9 cursor-pointer items-center whitespace-nowrap rounded-full border-0 px-3 text-[13px] font-semibold ${
              o.essential ? 'bg-[#E6ECFB] text-[#1A3E9E] hover:bg-[#D8E1F8]' : 'bg-hover text-ink-2 hover:bg-soft'
            }`}
          >
            {o.essential ? 'Essential' : 'Non-essential'}
          </button>
        </div>
      ))}
      <p className="mt-1.5 text-xs text-muted">Tap a tag to change it. All scheduled expenses count toward coverage; essential tags also determine your safety cushion.</p>
    </div>
  );
}
