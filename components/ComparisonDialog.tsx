'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { AgentStep, FinancialPicture } from '@/lib/types';
import type { BuyQuestion } from '@/lib/agent/buyOptions';
import type { ComparisonRecommendation } from '@/lib/agent/comparisonPolicy';
import { money, shortDate } from '@/lib/format';
import { DEMO_ASOF } from '@/lib/people';
import { buildBuyScenarios } from './buyScenarios';
import { readComparisonResponse } from './compareStream';
import { ScenarioChart, SCENARIO_COLORS } from './ScenarioChart';
import { SearchSteps } from './PurchasePanel';
import { Pill, TONE, btn, btn2 } from './ui';

export function ComparisonDialog({ picture, purchases, onClose }: { picture: FinancialPicture; purchases: BuyQuestion[]; onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [scenarios, setScenarios] = useState(() => buildBuyScenarios(picture, purchases, DEMO_ASOF));
  const [recommendation, setRecommendation] = useState<ComparisonRecommendation | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [running, setRunning] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const account = picture.accounts.find((a) => a.id === purchases[0]?.sourceAccountId);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => {
      if (request.current !== controller) return;
      controller.abort(); request.current = null;
      setRunning(false); setError('The comparison took too long. Please try again.');
    }, 130_000);
    void fetch('/api/agent/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchases }), signal: controller.signal })
      .then((response) => readComparisonResponse(response, (event) => {
        if (request.current !== controller) return;
        if (event.type === 'scenarios') setScenarios(event.scenarios);
        else if (event.type === 'step') setSteps((current) => [...current, event.step]);
        else if (event.type === 'done') setRecommendation(event.recommendation);
        else setError(event.error);
      }))
      .catch((err: Error) => { if (request.current === controller) setError(err.message || 'The comparison couldn’t finish. Try again.'); })
      .finally(() => { window.clearTimeout(timeout); if (request.current === controller) { request.current = null; setRunning(false); } });
    return () => { controller.abort(); window.clearTimeout(timeout); if (request.current === controller) request.current = null; };
  }, [purchases, attempt]);
  const retry = () => { setError(null); setRecommendation(null); setSteps([]); setRunning(true); setAttempt((n) => n + 1); };
  const recommended = scenarios.find((s) => s.id === recommendation?.id);

  return <dialog ref={dialog} className="buy-compare-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="buy-compare-dialog-header">
      <div><span className="buy-compare-eyebrow">Nemotron decision agent</span><h2 id={`${id}-title`}>Buy, wait, or skip</h2><p id={`${id}-description`}>{purchases.length === 1 ? purchases[0].label : `${purchases.length} purchases`} · {account?.nickname ?? 'Selected account'}</p></div>
      <button type="button" className="buy-compare-close" onClick={onClose} aria-label="Close scenario comparison">×</button>
    </header>
    <div className="buy-compare-dialog-body">
      <div className="buy-compare-recommendation" role="status" aria-live="polite">
        {recommendation ? <><span className="buy-compare-eyebrow">{recommendation.source === 'nemotron' ? 'Nemotron recommends' : 'Engine suggestion'}</span><strong>{recommended?.title ?? 'Hold off for now'}</strong><p>{recommendation.why}</p></>
          : <div className="buy-compare-progress"><strong>{running ? 'Comparing your options…' : 'Recommendation unavailable'}</strong><span>{running ? steps.at(-1)?.text ?? 'Nemotron is comparing the combined purchase plans.' : 'Your available forecasts are shown below.'}</span></div>}
      </div>
      {error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">{error} <button type="button" className="ml-2 font-semibold underline" disabled={running} onClick={retry}>Try again</button></div>}
      <div className="buy-compare-cards">
        {scenarios.map((s) => {
          const r = s.result;
          const health = r?.after ?? s.baseline;
          const missing = !!(r?.missingInputs.length || health?.missingInputs.length);
          const tone = !health || missing ? 'bg-soft text-muted' : s.id === 'skip' ? TONE[health.overall].pill
            : r?.verdict === 'yes' ? 'bg-good-bg text-good' : !r?.liquid || health.overall === 'red' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn';
          const status = !health ? 'Unavailable' : missing ? 'Needs input' : s.id === 'skip' ? TONE[health.overall].label
            : r?.verdict === 'yes' ? 'Fits your budget' : !r?.liquid || health.overall === 'red' ? 'Not right now' : 'Needs a plan';
          const scoreBefore = s.id === 'skip' ? scenarios[0].result?.scoreBefore : r?.scoreBefore;
          const dates = s.purchases.map((item) => item.date).sort();
          const dateLabel = dates.length ? dates[0] === dates.at(-1) ? shortDate(dates[0]) : `${shortDate(dates[0])} – ${shortDate(dates.at(-1)!)}` : '';
          return <article key={s.id} className="buy-compare-card" data-recommended={s.id === recommendation?.id} style={{ '--scenario-color': SCENARIO_COLORS[s.id] } as CSSProperties}>
            <div className="buy-compare-card-top"><h3>{s.title}</h3>{s.id === recommendation?.id && <span>Recommended</span>}</div>
            <strong className="buy-compare-price">{s.totalCost == null ? '—' : money(s.totalCost)}</strong>
            <p className="buy-compare-date">{s.id === 'skip' && s.baseline ? 'No new charges · keep your money in this account' : s.question ? `${s.purchases.length > 1 ? `${s.purchases.length} purchases · ` : ''}${dateLabel}` : s.unavailable}</p>
            <Pill className={`${tone} self-start`}>{status}</Pill>
            <dl className="buy-compare-stats"><div><dt>Health score</dt><dd>{health ? <>{scoreBefore ?? '—'} <span aria-hidden="true">→</span><span className="sr-only">to</span> {missing ? '—' : health.score ?? '—'}</> : '—'}</dd></div><div><dt>Lowest balance</dt><dd className={(s.lowest?.balance ?? 0) < 0 ? 'text-bad' : ''}>{s.lowest ? money(s.lowest.balance) : '—'}</dd></div></dl>
            {health && <details><summary>Details</summary>
              <p>{r?.reason ?? 'Forecast without these purchases. Existing bills, deposits and commitments still apply.'}</p>
              {s.purchases.length > 1 && <ul className="buy-compare-purchase-list">{s.purchases.map((item, index) => <li key={`${index}-${item.label}`}><span>{item.label}<small>{shortDate(item.date)}</small></span><strong>{money(item.cost)}</strong></li>)}</ul>}
              {r?.lowUntilPayday && <p className="text-warn">Only {money(r.lowUntilPayday.left)} remains before the next deposit or forecast end; allow for everyday spending.</p>}
              {!!health.flags.length && <ul className="text-bad">{health.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>}
              {!!(r?.missingInputs.length || health.missingInputs.length) && <ul>{(r?.missingInputs.length ? r.missingInputs : health.missingInputs).map((item) => <li key={item}>{item}</li>)}</ul>}
            </details>}
          </article>;
        })}
      </div>
      <p className="buy-compare-swipe">Swipe to view all three scenarios</p>
      <section aria-label="Scenario balance comparison"><h3 className="buy-compare-chart-heading">Money over time</h3><ScenarioChart scenarios={scenarios} /></section>
      <footer className="buy-compare-dialog-footer">
        <details className="buy-compare-activity"><summary>Agent activity{steps.length ? ` · ${steps.length} updates` : ''}</summary><SearchSteps steps={steps} running={running} /></details>
        <button type="button" className={btn} onClick={onClose}>Done</button>
        {!running && !error && recommendation?.source === 'engine' && <button type="button" className={btn2} onClick={retry}>Retry Nemotron</button>}
      </footer>
    </div>
  </dialog>;
}
