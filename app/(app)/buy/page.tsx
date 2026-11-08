'use client';

import { useEffect, useRef, useState } from 'react';
import type { AffordResult } from '@/lib/types';
import { canAffordPurchases, MAX_PURCHASES, purchaseTotal } from '@/lib/engine/basket';
import { validDate } from '@/lib/engine/validation';
import { daysBetween } from '@/lib/engine/dates';
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
import { PurchaseListEditor, type PurchaseDraft } from '@/components/PurchaseListEditor';
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

function headline(r: AffordResult, count: number): string {
  if (r.missingInputs.length) return 'A few details are missing.';
  if (r.verdict === 'yes') return count > 1 ? 'These purchases fit your budget together.' : 'This fits your budget.';
  if (r.verdict === 'yesIf' && r.weeklySavingsNeeded && r.readyDate)
    return `Yes, if you save ${money0(r.weeklySavingsNeeded)}/week. Ready ${shortDate(r.readyDate)}.`;
  if (r.verdict === 'yesIf' && r.readyDate) return count > 1 ? `Wait until ${shortDate(r.readyDate)} for the earlier purchases.` : `Wait until your ${shortDate(r.readyDate)} paycheck.`;
  return r.flags.some((f) => f.includes('emergency')) ? 'Keep your emergency savings protected.' : count > 1 ? 'Give this purchase plan a little more time.' : 'Give this purchase a little more time.';
}

export default function BuyPage() {
  const { person } = useViewer();
  const loaded = usePicture(person.id);
  const [items, setItems] = useState<PurchaseDraft[]>([{ id: 'first-purchase', label: EXAMPLES[0].label, cost: EXAMPLES[0].cost, date: EXAMPLES[0].date }]);
  const [from, setFrom] = useState('checking');
  const [asked, setAsked] = useState<{ memberId: string; items: PurchaseDraft[]; from: string; purchases: BuyQuestion[] } | null>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const picture = loaded.status === 'ready' ? loaded.picture : null;
  const options = picture ? fundingOptions(picture) : [];
  const selected = options.find((o) => o.value === from) ?? options[0];
  const current = asked?.memberId === person.id ? asked : null;
  const purchases = current?.purchases ?? null;
  const amount = purchaseTotal(items.map((item) => ({ cost: parseMoney(item.cost) ?? NaN })));
  const valid = !!selected && items.length > 0 && items.length <= MAX_PURCHASES && amount !== null && amount > 0 && items.every((item) =>
    item.label.trim().length >= 2 && item.label.trim().length <= 60 && validDate(item.date) && item.date >= DEMO_ASOF && daysBetween(DEMO_ASOF, item.date) <= 335);
  const result = picture && purchases ? canAffordPurchases(picture, purchases, DEMO_ASOF) : null;
  const askedAmount = purchases ? purchaseTotal(purchases) : null;
  const askedFunding = options.find((o) => o.value === current?.from);
  const askedAccount = picture?.accounts.find((a) => a.id === askedFunding?.sourceAccountId);
  const edited = current && (JSON.stringify(items) !== JSON.stringify(current.items) || selected?.value !== current.from);

  useEffect(() => {
    if (asked?.memberId === person.id) answerHeading.current?.focus();
  }, [asked, person.id]);

  const preview = (nextItems: PurchaseDraft[], requestedFrom: string) => {
    const funding = options.find((o) => o.value === requestedFrom)
      ?? (['checking', 'free'].includes(requestedFrom) ? options.find((o) => picture?.accounts.find((a) => a.id === o.sourceAccountId)?.type === (requestedFrom === 'free' ? 'Savings' : 'Checking')) : undefined);
    if (!funding || !nextItems.length || nextItems.length > MAX_PURCHASES) return;
    const normalized = nextItems.map((item) => ({ ...item, label: item.label.trim() }));
    const next: BuyQuestion[] = normalized.map((item) => ({ label: item.label, cost: parseMoney(item.cost) ?? NaN, date: item.date, sourceAccountId: funding.sourceAccountId, ...(funding.goalId ? { goalId: funding.goalId } : {}) }));
    if (purchaseTotal(next) === null || next.some((item) => item.label.length < 2 || !validDate(item.date) || item.date < DEMO_ASOF || daysBetween(DEMO_ASOF, item.date) > 335)) return;
    setItems(normalized);
    setFrom(funding.value);
    setAsked({ memberId: person.id, items: normalized, from: funding.value, purchases: next });
  };

  return (
    <PageShell id="buy" eyebrow="Before you buy" title="Can I buy it?" intro="A little clarity before checkout. See how your purchases fit your money together.">

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
              if (valid) preview(items, selected?.value ?? '');
            }}
          >
            <div className="buy-form-heading">
              <span className="buy-step" aria-hidden="true">01</span>
              <div>
                <h2 className="m-0">Your purchase plan</h2>
                <p className="buy-caption">Add an item and a date for each purchase.</p>
              </div>
            </div>
            <PurchaseListEditor items={items} onChange={setItems} asOf={DEMO_ASOF} />
            <div className="buy-basket-total"><span>Combined purchase total</span><strong>{amount === null ? '—' : money(amount)}</strong></div>
            <label className="buy-field">
              {items.length > 1 ? 'Pay for these purchases from' : 'Pay from'}
              <select className={input} value={selected?.value ?? ''} onChange={(e) => setFrom(e.target.value)}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" className={`${btn} buy-submit`} disabled={!valid}>
              {items.length > 1 ? 'Check all purchases' : 'Check this purchase'} <span aria-hidden="true">→</span>
            </button>
            <p className="buy-form-note">A preview of your budget. No purchase is made.</p>
            <div className="buy-examples">
              <span className="buy-caption">Or try an example</span>
              <div className="buy-example-list">
                {EXAMPLES.map((ex) => (
                  <button key={ex.chip} type="button" onClick={() => preview([{ id: crypto.randomUUID(), label: ex.label, cost: ex.cost, date: ex.date }], ex.from)} className="buy-example">
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
                <h2>Will your plan fit your budget?</h2>
                <p>Add one or more purchases to see their combined effect on your money and score.</p>
                <div className="buy-check-tags"><span>Upcoming bills</span><span>Savings goals</span><span>Score impact</span></div>
              </div>
            ) : (
              <div className="buy-answer-content" aria-live="polite">
                <div className="buy-receipt">
                  <div className="buy-receipt-item">
                    <span className="buy-caption">Purchase preview</span>
                    <strong>{purchases?.length === 1 ? purchases[0].label : `${purchases?.length ?? 0} purchases`}</strong>
                    <span className="buy-caption">{purchases?.length === 1 ? shortDate(purchases[0].date) : 'Each purchase keeps its selected date'}{askedAccount && ` · ${askedAccount.nickname}`}</span>
                  </div>
                  <strong className="buy-receipt-price">{askedAmount === null ? '—' : money(askedAmount)}</strong>
                </div>
                {purchases && purchases.length > 1 && <ul className="buy-planned-items">{purchases.map((item, index) => <li key={current!.items[index].id}><span>{item.label}<small>{shortDate(item.date)}</small></span><strong>{money(item.cost)}</strong></li>)}</ul>}
                {edited && <p className="buy-edited" role="status">Details changed. Check again to update your answer.</p>}
                <div className="buy-verdict" data-verdict={result.missingInputs.length ? 'needsInput' : result.verdict}>
                  <Pill className={`${result.missingInputs.length ? 'bg-soft text-muted' : VERDICT[result.verdict].className} px-3 py-1.5 text-sm`}>
                    {result.missingInputs.length ? 'Needs input' : VERDICT[result.verdict].label}
                  </Pill>
                  <h2 ref={answerHeading} tabIndex={-1}>{headline(result, purchases?.length ?? 1)}</h2>
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
                    label={purchases && purchases.length > 1 ? 'With all purchases' : 'Score after buying'}
                    value={result.missingInputs.length ? null : result.scoreAfter}
                    tone={result.after.overall === 'green' ? 'good' : result.after.overall === 'red' ? 'bad' : 'warn'}
                  />
                </div>
                {purchases && <BuyComparison key={`${person.id}|${JSON.stringify(purchases)}|${result.before.dataHash}`} picture={picture} purchases={purchases} />}
                {result.verifiedAlternative && <p className="rounded-lg bg-good-bg p-3">Verified alternative score: {result.verifiedAlternative.result.score ?? 'Needs input'} on {shortDate(result.verifiedAlternative.date)}.</p>}
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
