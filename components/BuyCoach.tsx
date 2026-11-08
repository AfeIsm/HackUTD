'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AgentStep } from '@/lib/types';
import type { BuyQuestion } from '@/lib/agent/buyOptions';
import type { AgentAnswer } from '@/lib/agent/loop';
import { money, shortDate } from '@/lib/format';
import { SearchSteps } from './PurchasePanel';
import { Card, Pill, StatusPill, btn, btn2, input } from './ui';
import { buyCoachContext, readCoachResponse } from './buyCoachRequest';

const QUESTIONS = [
  { label: 'Make it work', text: 'What changes could help me afford this? Protect my savings goals.' },
  { label: 'Wait for payday', text: 'Would waiting until payday help? Keep the same item, price and account.' },
  { label: 'Find cuts', text: 'Which nonessential subscriptions could I cut? Protect my savings goals.' },
];

export function BuyCoach({ purchase, accountName }: { purchase: BuyQuestion; accountName: string }) {
  const id = useId();
  const request = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  // Preserve the purchase and exact funding source in every follow-up. The server gets the
  // viewer from their session and re-scores the agent's proposed scenario with the engine.
  const context = buyCoachContext(purchase);
  const maxQuestion = Math.max(0, 400 - context.length);

  async function ask(text: string) {
    if (request.current || text.trim().length < 3 || text.trim().length > maxQuestion) return;
    const controller = new AbortController();
    request.current = controller;
    setQuestion(text);
    setSteps([]);
    setAnswer(null);
    setError(null);
    setNotice(null);
    setRunning(true);
    const timeout = window.setTimeout(() => {
      if (request.current !== controller) return;
      controller.abort();
      request.current = null;
      setRunning(false);
      setError('Nemotron took too long. Try again in a moment.');
    }, 90_000);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: context + text.trim() }), signal: controller.signal,
      });
      await readCoachResponse(response, (event) => {
        if (request.current !== controller) return;
        if (event.type === 'step') setSteps((current) => [...current, event.step]);
        else if (event.type === 'done') setAnswer(event.answer);
        else if (event.type === 'error') setError(event.error);
      });
    } catch (err) {
      if (request.current === controller) setError((err as Error).message || 'Couldn’t reach Nemotron. Try again.');
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setRunning(false); }
    }
  }

  const stop = () => {
    request.current?.abort();
    request.current = null;
    setRunning(false);
    setNotice('Stopped. You can ask another question.');
  };
  const plan = answer?.plan;

  return (
    <Card label="Nemotron purchase coach" className="buy-coach">
      <div className="buy-coach-heading">
        <div><span className="buy-coach-eyebrow">Nemotron agent</span><h2>Find a way forward</h2></div>
        <Pill className="bg-good-bg text-good">AI coach</Pill>
      </div>
      <p className="buy-coach-description">Ask about timing or spending changes. Each suggestion is checked with your money engine.</p>
      <div className="buy-coach-context"><strong>{purchase.label}</strong><span>{money(purchase.cost)} · {shortDate(purchase.date)} · {accountName}</span></div>
      <div className="buy-coach-questions">
        {QUESTIONS.map((q) => <button key={q.label} type="button" className="buy-example" disabled={running || q.text.length > maxQuestion} onClick={() => void ask(q.text)}>{q.label}<span aria-hidden="true">↗</span></button>)}
      </div>
      <form className="buy-coach-form" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <label htmlFor={`${id}-question`}>Add your preferences</label>
        <textarea id={`${id}-question`} className={input} value={question} maxLength={maxQuestion} rows={2} disabled={running}
          placeholder="e.g. Keep Spotify and avoid using my savings" onChange={(e) => setQuestion(e.target.value)} aria-describedby={`${id}-limit`} />
        <span id={`${id}-limit`} className="buy-caption">{maxQuestion} characters available for your question.</span>
        <div className="buy-coach-actions">
          <button type="submit" className={btn} disabled={running || question.trim().length < 3 || question.trim().length > maxQuestion}>{running ? 'Nemotron is working…' : error ? 'Try again' : 'Ask Nemotron'}</button>
          {running && <button type="button" className={btn2} onClick={stop}>Stop</button>}
        </div>
      </form>
      {running && <p role="status" className="buy-coach-progress">{steps.at(-1)?.text ?? 'Nemotron is reading your purchase and planning its checks…'}</p>}
      {notice && <p role="status" className="buy-caption">{notice}</p>}
      {error && <p role="alert" className="m-0 rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}
      {plan && <div className="buy-coach-plan">
        <span className="buy-coach-eyebrow">Engine-checked suggestion{answer.cached ? ' · saved answer' : ''}</span>
        <h3>{plan.headline}</h3>
        <div className="buy-coach-scores" aria-label="Proposed scenario health score">
          <span>{plan.scoreBefore ?? 'Needs input'}</span><StatusPill status={plan.statusBefore} />
          <span aria-hidden="true">→</span><span className="sr-only">to</span>
          <span>{plan.scoreAfter ?? 'Needs input'}</span><StatusPill status={plan.statusAfter} />
        </div>
        {plan.firstStep && <p><strong>First step:</strong> {plan.firstStep}</p>}
        {plan.actions.length > 0 && <ul>{plan.actions.map((action, i) => <li key={`${i}-${action}`}>{action}</li>)}</ul>}
        {plan.focus && <p className="buy-coach-caution">{plan.focus}</p>}
        {plan.problems.length > 0 && <ul className="text-bad">{plan.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        {plan.notGreen.length > 0 && <details><summary>What still needs attention</summary><ul>{plan.notGreen.map((item) => <li key={item}>{item}</li>)}</ul></details>}
        {plan.explanation && <details><summary>Nemotron’s explanation</summary><p>{plan.explanation}</p></details>}
        {plan.review && !plan.review.approved && <p className="buy-coach-caution">Additional review flagged this suggestion: {plan.review.flags.join(' · ') || 'Review the plan carefully.'}</p>}
        <p className="buy-caption">This explores a possible plan. Your original purchase check stays above.</p>
      </div>}
      {answer && !plan && <p className="buy-caption" role="status">{answer.message || 'No suggestion was returned. Try a more specific question.'}</p>}
      {steps.length > 0 && <details className="buy-coach-activity"><summary>See agent activity · {steps.length} updates</summary><SearchSteps steps={steps} running={running} /></details>}
    </Card>
  );
}
