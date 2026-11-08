'use client';

import { useEffect, useRef, useState } from 'react';
import type { AffordResult } from '@/lib/types';
import { canAfford } from '@/lib/engine/afford';
import { fundingOptions } from '@/lib/fundingOptions';
import { parseMoney } from '@/lib/engine/money';
import { IndicatorList } from '@/components/IndicatorList';
import { money, money0, shortDate } from '@/lib/format';
import { DEMO_ASOF } from '@/lib/people';
import { usePicture } from '@/lib/usePicture';
import { useViewer } from '@/lib/viewer';
import { Card, Pill, btn, input } from '@/components/ui';
import { PageShell } from '@/components/wallet/PageShell';
import { BuyComparison } from '@/components/BuyComparison';
import type { BuyQuestion } from '@/lib/agent/buyOptions';
import './buy.css';

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
  if (r.missingInputs.length) return 'A few details are missing.';
  if (r.verdict === 'yes') return 'This fits your budget.';
  if (r.verdict === 'yesIf' && r.weeklySavingsNeeded && r.readyDate)
    return `Yes, if you save ${money0(r.weeklySavingsNeeded)}/week. Ready ${shortDate(r.readyDate)}.`;
  if (r.verdict === 'yesIf' && r.readyDate) return `Wait until your ${shortDate(r.readyDate)} paycheck.`;
  return r.flags.some((f) => f.includes('emergency')) ? 'Keep your emergency savings protected.' : 'Give this purchase a little more time.';
}

export default function BuyPage() {
  const { person } = useViewer();
  const loaded = usePicture(person.id);
  const [q, setQ] = useState<Question>(EXAMPLES[0]);
  const [asked, setAsked] = useState<{ memberId: string; q: Question } | null>(null);
  const [askedQuestion, setAskedQuestion] = useState<BuyQuestion | null>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);

  const picture = loaded.status === 'ready' ? loaded.picture : null;
  const options = picture ? fundingOptions(picture) : [];
  const selected = options.find((o) => o.value === q.from) ?? options[0];
  const askedQ = asked?.memberId === person.id ? asked.q : null;

  useEffect(() => {
    if (asked?.memberId === person.id) answerHeading.current?.focus();
  }, [asked, person.id]);

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
    const cost = parseMoney(normalized.cost) ?? 0;
    const label = normalized.label.trim();
    if (funding && cost > 0 && label.length >= 2 && normalized.date) {
      const question = { label, cost, date: normalized.date, sourceAccountId: funding.sourceAccountId, goalId: funding.goalId };
      setAskedQuestion(question);
    } else setAskedQuestion(null);
  };

  const askedFunding = options.find((o) => o.value === askedQ?.from);
  const askedAccount = picture?.accounts.find((a) => a.id === askedFunding?.sourceAccountId);
  const edited = askedQ && (q.label !== askedQ.label || q.cost !== askedQ.cost || q.date !== askedQ.date || selected?.value !== askedQ.from);

  return (
    <PageShell id="buy" eyebrow="Before you buy" title="Can I buy it?" intro="A little clarity before checkout. See how a purchase fits your money.">

      {loaded.status !== 'ready' || !picture ? (
        <Card>
          <p className="m-0 text-ink-2" role={loaded.status === 'error' ? 'alert' : 'status'}>
            {loaded.status === 'loading' ? 'Loading your accounts…' : loaded.status === 'error' ? 'Couldn’t load your accounts.' : `${person.name} doesn’t have any accounts yet.`}
          </p>
        </Card>
      ) : (
        <div className="buy-layout">
          <form
            className="paper-card buy-form"
            aria-label="Purchase question"
            onSubmit={(e) => {
              e.preventDefault();
              ask({ ...q, from: selected?.value ?? '' });
            }}
          >
            <div className="buy-form-heading">
              <span className="buy-step" aria-hidden="true">01</span>
              <div>
                <h2 className="m-0">Your next purchase</h2>
                <p className="buy-caption">Start with something on your wishlist.</p>
              </div>
            </div>
            <label className="buy-field">
              What are you buying?
              <input className={input} required minLength={2} maxLength={60} value={q.label} onChange={(e) => setQ({ ...q, label: e.target.value })} placeholder="PlayStation 6" />
            </label>
            <div className="buy-form-pair">
              <label className="buy-field">
                Price (USD)
                <span className="buy-price-field">
                  <span aria-hidden="true">$</span>
                  <input className="buy-price-input" inputMode="decimal" required value={q.cost} onChange={(e) => setQ({ ...q, cost: e.target.value })} placeholder="0.00" />
                </span>
              </label>
              <label className="buy-field">
                Purchase date
                <input className={input} type="date" value={q.date} min={DEMO_ASOF} onChange={(e) => setQ({ ...q, date: e.target.value })} />
              </label>
            </div>
            <label className="buy-field">
              Pay from
              <select className={input} value={selected?.value ?? ''} onChange={(e) => setQ({ ...q, from: e.target.value })}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" className={`${btn} buy-submit`} disabled={q.label.trim().length < 2 || !q.date || !selected || (parseMoney(q.cost) ?? 0) <= 0}>
              Check this purchase <span aria-hidden="true">→</span>
            </button>
            <p className="buy-form-note">A preview of your budget. No purchase is made.</p>
            <div className="buy-examples">
              <span className="buy-caption">Or try an example</span>
              <div className="buy-example-list">
                {EXAMPLES.map((ex) => (
                  <button key={ex.chip} type="button" onClick={() => ask(ex)} className="buy-example">
                    {ex.chip}<span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          </form>

          <div className="buy-results">
          <Card label="Purchase answer" className={`buy-answer ${result ? 'buy-answer-ready' : 'buy-answer-empty'}`}>
            {!result ? (
              <div className="buy-empty" aria-live="polite">
                <div className="buy-empty-art" aria-hidden="true">
                  <svg width="92" height="102" viewBox="0 0 92 102" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 9h56v83l-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5V9Z" fill="var(--paper)" />
                    <path d="M30 26h32M30 36h20M30 72h32" opacity=".35" />
                    <circle cx="47" cy="54" r="11" fill="var(--note-light)" stroke="none" />
                    <path d="m41 54 4 4 8-8" />
                  </svg>
                </div>
                <h2>Will it fit your budget?</h2>
                <p>Enter a purchase to see your answer and how it changes your score.</p>
                <div className="buy-check-tags"><span>Upcoming bills</span><span>Savings goals</span><span>Score impact</span></div>
              </div>
            ) : (
              <div className="buy-answer-content" aria-live="polite">
                <div className="buy-receipt">
                  <div className="buy-receipt-item">
                    <span className="buy-caption">Purchase preview</span>
                    <strong>{askedQ?.label}</strong>
                    <span className="buy-caption">{askedQ && shortDate(askedQ.date)}{askedAccount && ` · ${askedAccount.nickname}`}</span>
                  </div>
                  <strong className="buy-receipt-price">{money(parseMoney(askedQ?.cost ?? '') ?? 0)}</strong>
                </div>
                {edited && <p className="buy-edited" role="status">Details changed. Check again to update your answer.</p>}
                <div className="buy-verdict" data-verdict={result.missingInputs.length ? 'needsInput' : result.verdict}>
                  <Pill className={`${result.missingInputs.length ? 'bg-soft text-muted' : VERDICT[result.verdict].className} px-3 py-1.5 text-sm`}>
                    {result.missingInputs.length ? 'Needs input' : VERDICT[result.verdict].label}
                  </Pill>
                  <h2 ref={answerHeading} tabIndex={-1}>{headline(result)}</h2>
                </div>
                {result.lowUntilPayday && (
                  <p role="status" className="m-0 rounded-[10px] bg-warn-bg px-3.5 py-3 text-sm text-warn">
                    This leaves {money0(result.lowUntilPayday.left)} {result.lowUntilPayday.payday ? `until your ${shortDate(result.lowUntilPayday.payday)} paycheck` : 'in this account'}. Everyday spending like food and gas isn’t counted in your score.
                  </p>
                )}
                <div className="buy-score-heading"><h3>Your health score</h3><span>out of 100</span></div>
                <div className="buy-score-comparison">
                  <ScoreBox label="Score now" value={result.scoreBefore} />
                  <span className="buy-score-arrow" aria-hidden="true">→</span>
                  <ScoreBox
                    label={result.verdict === 'yes' ? 'Score after buying' : 'If you bought it now'}
                    value={result.scoreAfter}
                    tone={result.after.overall === 'green' ? 'good' : result.after.overall === 'red' ? 'bad' : 'warn'}
                  />
                </div>
                {askedQ && askedQuestion && <BuyComparison key={`${person.id}|${JSON.stringify(askedQuestion)}|${result?.before.dataHash}`} picture={picture} purchase={askedQuestion} />}
                {result.verifiedAlternative && <p className="rounded-lg bg-good-bg p-3">Verified alternative score: {result.verifiedAlternative.result.score} on {shortDate(result.verifiedAlternative.date)}.</p>}
                {result.missingInputs.length > 0 && <div className="buy-missing"><h3>Complete your check</h3><ul>{result.missingInputs.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                {result.flags.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {result.flags.map((f) => (
                      <li key={f} className="rounded-[10px] bg-bad-bg px-3.5 py-3 text-sm text-[#7A1712]">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="buy-breakdown">
                  <details><summary>Why this answer?</summary><p>{result.reason}</p></details>
                  <details><summary>Score breakdown · before</summary><IndicatorList indicators={result.before.indicators} /></details>
                  <details><summary>Score breakdown · after</summary><IndicatorList indicators={result.after.indicators} /></details>
                </div>
              </div>
            )}
          </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function ScoreBox({ label, value, tone }: { label: string; value: number | null; tone?: 'good' | 'warn' | 'bad' }) {
  const bg = value === null ? 'bg-bg' : tone === 'bad' ? 'bg-bad-bg' : tone === 'warn' ? 'bg-warn-bg' : tone === 'good' ? 'bg-good-bg' : 'bg-bg';
  const fg = value === null ? 'text-muted' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink';
  return (
    <div className={`buy-score ${bg}`}>
      <span className="buy-caption">{label}</span>
      <strong className={`${value === null ? 'buy-score-incomplete' : 'buy-score-value'} ${fg}`}>{value ?? 'Needs input'}</strong>
    </div>
  );
}
