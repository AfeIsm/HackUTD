'use client';

import { useState } from 'react';
import type { AffordResult } from '@/lib/types';
import { canAfford } from '@/lib/engine/afford';
import { fundingOptions } from '@/lib/fundingOptions';
import { parseMoney } from '@/lib/engine/money';
import { IndicatorList } from '@/components/IndicatorList';
import { money0, shortDate } from '@/lib/format';
import { DEMO_ASOF } from '@/lib/people';
import { usePicture } from '@/lib/usePicture';
import { useViewer } from '@/lib/viewer';
import { Card, Eyebrow, Pill, btn, input } from '@/components/ui';

interface Question {
  label: string;
  cost: string;
  date: string;
  from: string; // 'checking' | 'free' | goal id
}

const EXAMPLES: (Question & { chip: string })[] = [
  { chip: '$900 PS6 today', label: 'PlayStation 6', cost: '900', date: DEMO_ASOF, from: 'checking' },
  { chip: '$120 concert, Nov 21', label: 'Concert tickets', cost: '120', date: '2026-11-21', from: 'checking' },
  { chip: '$180 from savings', label: 'Headphones', cost: '180', date: DEMO_ASOF, from: 'free' },
];

const VERDICT = {
  yes: { label: 'Yes', className: 'bg-good-bg text-good' },
  yesIf: { label: 'Yes, if…', className: 'bg-warn-bg text-warn' },
  no: { label: 'Not right now', className: 'bg-bad-bg text-bad' },
} as const;

function headline(r: AffordResult): string {
  if (r.verdict === 'yes') return 'Yes. You can cover this and every essential bill.';
  if (r.verdict === 'yesIf' && r.weeklySavingsNeeded && r.readyDate)
    return `Yes, if you save ${money0(r.weeklySavingsNeeded)}/week. Ready ${shortDate(r.readyDate)}.`;
  if (r.verdict === 'yesIf' && r.readyDate) return `Yes, after your ${shortDate(r.readyDate)} paycheck.`;
  return r.flags.some((f) => f.includes('emergency')) ? 'Not right now. This uses your emergency savings.' : 'Not right now.';
}

export default function BuyPage() {
  const { person } = useViewer();
  const loaded = usePicture(person.id);
  const [q, setQ] = useState<Question>(EXAMPLES[0]);
  const [asked, setAsked] = useState<{ memberId: string; q: Question } | null>(null);

  const picture = loaded.status === 'ready' ? loaded.picture : null;
  const options = picture ? fundingOptions(picture) : [];
  const selected = options.find((o) => o.value === q.from) ?? options[0];
  const askedQ = asked?.memberId === person.id ? asked.q : null;

  let result: AffordResult | null = null;
  if (picture && askedQ && Number(askedQ.cost) > 0) {
    const funding = options.find((o) => o.value === askedQ.from);
    result = canAfford(
      picture,
      {
        label: askedQ.label || 'this',
        cost: parseMoney(askedQ.cost) ?? NaN,
        date: askedQ.date || undefined,
        sourceAccountId: funding?.sourceAccountId ?? '',
        goalId: funding?.goalId,
      },
      DEMO_ASOF,
    );
  }

  const ask = (next: Question) => {
    const funding = options.find((o) => o.value === next.from)
      ?? options.find((o) => picture?.accounts.find((a) => a.id === o.sourceAccountId)?.type === (next.from === 'free' ? 'Savings' : 'Checking'));
    const normalized = { ...next, from: funding?.value ?? '' };
    setQ(normalized);
    setAsked({ memberId: person.id, q: normalized });
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>What if</Eyebrow>
        <h1 className="m-0 text-[32px]">Can I buy it?</h1>
        <p className="m-0 text-ink-2">We re-score your money as if you already bought it.</p>
      </div>

      {loaded.status !== 'ready' || !picture ? (
        <Card>
          <p className="m-0 text-ink-2">
            {loaded.status === 'loading' ? 'Loading your accounts…' : loaded.status === 'error' ? 'Couldn’t load your accounts.' : `${person.name} doesn’t have any accounts yet.`}
          </p>
        </Card>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <form
            className="box-border flex flex-[1_1_360px] flex-col gap-[18px] rounded-[14px] border border-line bg-surface p-6"
            aria-label="Purchase question"
            onSubmit={(e) => {
              e.preventDefault();
              ask({ ...q, from: selected?.value ?? '' });
            }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Try an example</span>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.chip}
                    type="button"
                    onClick={() => ask(ex)}
                    className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line-2 bg-white px-3.5 text-sm font-medium text-ink hover:bg-hover"
                  >
                    {ex.chip}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              What is it?
              <input className={input} value={q.label} onChange={(e) => setQ({ ...q, label: e.target.value })} placeholder="PlayStation 6" />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-[1_1_140px] flex-col gap-1.5 text-sm font-semibold">
                Cost
                <input className={input} inputMode="decimal" value={q.cost} onChange={(e) => setQ({ ...q, cost: e.target.value })} placeholder="900" />
              </label>
              <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
                When
                <input className={input} type="date" value={q.date} min={DEMO_ASOF} onChange={(e) => setQ({ ...q, date: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Pay from
              <select className={input} value={selected?.value ?? ''} onChange={(e) => setQ({ ...q, from: e.target.value })}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" className={btn} disabled={!selected || (parseMoney(q.cost) ?? 0) <= 0}>
              Check it
            </button>
          </form>

          <Card label="Answer" className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
            {!result ? (
              <p className="m-0 text-ink-2" aria-live="polite">
                Ask about something you’re thinking of buying, or try an example.
              </p>
            ) : (
              <div className="flex flex-col gap-[18px]" aria-live="polite">
                <div className="flex flex-wrap items-center gap-3">
                  <Pill className={`${VERDICT[result.verdict].className} px-3 py-1.5 text-sm`}>{VERDICT[result.verdict].label}</Pill>
                  <span className="text-[13px] text-muted">Same question + same data = same answer</span>
                </div>
                <h2 className="m-0 text-[28px] leading-tight">{headline(result)}</h2>
                <p className="m-0 leading-relaxed text-ink-2">{result.reason}</p>
                <div className="flex flex-wrap gap-3">
                  <ScoreBox label="Score now" value={result.scoreBefore} />
                  <ScoreBox
                    label={result.verdict === 'yes' ? 'Score after buying' : 'If you bought it now'}
                    value={result.scoreAfter}
                    tone={result.after.overall === 'green' ? 'good' : result.after.overall === 'red' ? 'bad' : 'warn'}
                  />
                </div>
                {result.verifiedAlternative && <p className="rounded-lg bg-good-bg p-3">Verified alternative score: {result.verifiedAlternative.result.score} on {shortDate(result.verifiedAlternative.date)}.</p>}
                <details><summary>Before: indicators</summary><IndicatorList indicators={result.before.indicators} /></details>
                <details><summary>After: indicators</summary><IndicatorList indicators={result.after.indicators} /></details>
                {result.missingInputs.length > 0 && <ul>{result.missingInputs.map((m) => <li key={m}>{m}</li>)}</ul>}
                {result.flags.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {result.flags.map((f) => (
                      <li key={f} className="rounded-[10px] bg-bad-bg px-3.5 py-3 text-sm text-[#7A1712]">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function ScoreBox({ label, value, tone }: { label: string; value: number | null; tone?: 'good' | 'warn' | 'bad' }) {
  const bg = tone === 'bad' ? 'bg-bad-bg' : tone === 'warn' ? 'bg-warn-bg' : tone === 'good' ? 'bg-good-bg' : 'bg-bg';
  const fg = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink';
  return (
    <div className={`flex flex-[1_1_160px] flex-col gap-1 rounded-xl p-4 ${bg}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`font-display text-[32px] font-bold ${fg}`}>{value ?? 'Needs input'}</span>
    </div>
  );
}
