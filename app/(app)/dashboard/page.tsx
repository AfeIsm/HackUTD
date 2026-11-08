'use client';

// My Money. Loads the latest SAVED health check from /api/health (MongoDB), and every change
// (purchase, tag, re-run) is saved through the API, which re-runs the check automatically.

import { useEffect, useState } from 'react';
import type { HealthPayload } from '@/lib/services/health';
import { freeSavings } from '@/lib/engine/source';
import { dayDate, money, money0 } from '@/lib/format';
import { invalidatePicture } from '@/lib/usePicture';
import { useViewer } from '@/lib/viewer';
import { AddPurchase, type NewPurchase } from '@/components/AddPurchase';
import { ForecastChart } from '@/components/ForecastChart';
import { IndicatorList } from '@/components/IndicatorList';
import { ObligationsList } from '@/components/ObligationsList';
import { ScoreGauge } from '@/components/ScoreGauge';
import { RandomizeFinances } from '@/components/RandomizeFinances';
import { FixPlanCard } from '@/components/FixPlanCard';
import { AgentPanel } from '@/components/AgentPanel';
import { Card, Eyebrow, StatusPill, TONE, btn2 } from '@/components/ui';

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

interface Loaded {
  id: string;
  payload?: HealthPayload;
  error?: string;
}

export default function DashboardPage() {
  const { person } = useViewer();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Load the latest saved health check (runs a first one if there's none)
  useEffect(() => {
    let alive = true;
    fetch('/api/health') // the server knows who you are from the session
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: HealthPayload) => alive && setLoaded({ id: person.id, payload }))
      .catch(() => alive && setLoaded({ id: person.id, error: 'Couldn’t load your accounts. Refresh to try again.' }));
    return () => {
      alive = false;
    };
  }, [person.id]);

  const current = loaded?.id === person.id ? loaded : null;
  const payload = current?.payload;
  const result = payload?.result;
  const picture = payload?.picture;
  const shownNote = note?.id === person.id ? note : null;
  const randomizeControl = <RandomizeFinances disabled={busy} onComplete={(next) => {
    setLoaded({ id: person.id, payload: next });
    invalidatePicture(person.id);
    setNote({ id: person.id, text: 'Generated a new Nessie demo profile and recalculated your score.', ok: true });
  }} />;

  // "Apply this plan" / "Undo" returns the fresh health check: show it.
  const applied = (next: HealthPayload, text: string) => {
    setLoaded({ id: person.id, payload: next });
    invalidatePicture(person.id);
    setNote({ id: person.id, text, ok: true });
  };

  // Save something, then show the fresh (automatically re-run) health check
  const send = async (url: string, method: string, body: Record<string, unknown>, describe: (p: HealthPayload) => string | null) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLoaded({ id: person.id, payload: data });
      invalidatePicture(person.id);
      const text = describe(data);
      setNote(text ? { id: person.id, text, ok: true } : null);
    } catch (err) {
      setNote({ id: person.id, text: `Couldn’t save that: ${(err as Error).message}`, ok: false });
    } finally {
      setBusy(false);
    }
  };

  if (!current || !result || !picture) {
    const message = !current
      ? 'Loading your accounts…'
      : current.error ?? `${person.name} doesn’t have any accounts yet, so there’s nothing to score.`;
    return (
      <>
        <PageTitle name={person.name} />
        <Card>
          <p className="m-0 text-ink-2" aria-live="polite">{message}</p>
          {randomizeControl}
        </Card>
      </>
    );
  }

  const addPurchase = (p: NewPurchase) =>
    send('/api/purchases', 'POST', { merchant: p.merchant, amount: p.amount, sourceAccountId: p.sourceAccountId, goalId: p.goalId }, () => null);
  const toggleTag = (key: string) => {
    const o = picture.obligations.find((x) => x.key === key);
    if (o) send('/api/obligations', 'PATCH', { key, essential: !o.essential }, () => null);
  };
  const rerun = () =>
    send('/api/health', 'POST', {}, (p) =>
      p.unchanged ? `Re-ran at ${timeLabel(p.result!.checkedAt)}. Same data, same score.` : 'Re-ran: your data changed since the last check.');
  const clearPurchases = () => send('/api/purchases', 'DELETE', {}, () => 'Cleared the purchases you added.');

  const checking = picture.accounts.filter((a) => a.type === 'Checking');
  const savings = picture.accounts.filter((a) => a.type === 'Savings');
  const cards = picture.accounts.filter((a) => a.type === 'Credit Card');
  const added = picture.txns.filter((t) => t.id.startsWith('app-'));

  return (
    <>
      <PageTitle name={person.name} />
      {randomizeControl}

      {result.missingInputs.length > 0 && (
        <Card label="Complete your assessment">
          <h2 className="m-0 mb-2 text-xl">Needs input</h2>
          <ul className="m-0 pl-5 text-ink-2">
            {result.missingInputs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Card>
      )}
      {result.flags.length > 0 && (
        <div role="alert" className="flex items-start gap-3.5 rounded-xl border border-[#F2C3BF] bg-bad-bg px-5 py-4 text-[#7A1712]">
          <WarningIcon />
          <div className="flex flex-col gap-1">
            {result.flags.map((f) => (
              <strong key={f}>{f}</strong>
            ))}
            <span className="text-sm">Your score is now {result.score ?? 'incomplete'}. See what changed below.</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-5">
        <Card label="Health score" className="flex flex-[1_1_300px] flex-col items-center gap-4 text-center">
          <Eyebrow className="self-start">Health score</Eyebrow>
          <ScoreGauge score={result.score} status={result.overall} />
          <StatusPill status={result.overall} />
          <p className="m-0 text-[13px] leading-normal text-muted">
            Score {result.score ?? 'incomplete'} · checked {timeLabel(result.checkedAt)} · after: {result.trigger}
          </p>
          {shownNote && (
            <p className={`m-0 rounded-lg px-3 py-2 text-[13px] ${shownNote.ok ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>{shownNote.text}</p>
          )}
          <button type="button" className={`${btn2} mt-auto w-full`} onClick={rerun} disabled={busy}>
            {busy ? 'Checking…' : 'Re-run health check'}
          </button>
          <span className="text-xs text-muted">{payload.saved ? 'Every check is saved to your history.' : 'History isn’t being saved right now.'}</span>
        </Card>

        <Card label="Indicators" className="flex min-w-0 flex-[999_1_560px] flex-col gap-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-xl">What makes up your score</h2>
            <span className="text-[13px] text-muted">points × weight</span>
          </div>
          <IndicatorList indicators={result.indicators} />
          <p className="mt-2 text-xs text-muted">
            Healthy 75–100 · Watch 50–74 · At risk 0–49. If essential bills aren’t covered, the score is At risk no matter what.
          </p>
        </Card>
      </div>

      {payload.plan && <FixPlanCard key={payload.plan.dataHash} plan={payload.plan} onApplied={applied} />}
      <AgentPanel onApplied={applied} />

      <div className="flex flex-wrap items-start gap-5">
        <Card label="Add a purchase" className="min-w-0 flex-[999_1_520px]">
          <h2 className="m-0 mb-3 text-xl">Add a purchase</h2>
          <AddPurchase picture={picture} onAdd={addPurchase} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-xs text-muted">Your health check re-runs automatically.</p>
            {added.length > 0 && (
              <button type="button" onClick={clearPurchases} disabled={busy} className="cursor-pointer border-0 bg-transparent p-1 text-xs font-semibold text-accent">
                Clear {added.length} added {added.length === 1 ? 'purchase' : 'purchases'}
              </button>
            )}
          </div>
        </Card>
        {payload.history.length > 0 && (
          <Card label="Recent checks" className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
            <h2 className="m-0 text-xl">Recent checks</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {payload.history.map((h, i) => (
                <li key={`${h.createdAt}-${i}`} className="flex items-center gap-3 border-t border-[#EFEFEA] py-2 text-[13px]">
                  <span className={`w-8 font-display text-base font-bold ${TONE[h.overall].pill.split(' ')[1]}`}>{h.score ?? '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{h.trigger}</span>
                  <span className="text-muted">{timeLabel(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <section aria-label="Accounts" className="flex flex-wrap gap-4">
        {checking.map((a) => (
          <SmallCard key={a.id} label={a.nickname} value={money(a.balance)} sub="Everyday spending" />
        ))}
        {savings.map((a) => (
          <SmallCard key={a.id} label={a.nickname} value={money(a.balance)}
            sub={`${money0(picture.goals.filter((g) => g.accountId === a.id).reduce((s, g) => s + g.amount, 0))} set aside · ${money0(freeSavings(picture, a.id))} free`} />
        ))}
        {cards.map((a) => (
          <SmallCard key={a.id} label={a.nickname} value={money(a.balance)}
            sub={a.limit ? `Owed · ${Math.round((a.balance / a.limit) * 100)}% of ${money0(a.limit)} limit` : 'Owed'} />
        ))}
        <SmallCard
          label="Paycheck · detected"
          value={picture.paycheck ? money0(picture.paycheck.avgAmount) : '—'}
          sub={picture.paycheck ? `Every ${picture.paycheck.cadenceDays} days · next ${dayDate(picture.paycheck.nextDate)}` : 'No regular paycheck found'}
        />
        <SmallCard
          label="Savings goals"
          value={picture.goals.length ? picture.goals.map((g) => `${g.name} · ${money0(g.amount)}`).join(', ') : 'No goals yet'}
          sub={picture.goals.length ? 'Set aside in savings' : 'Set money aside for something specific'}
          small
        />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <Card label="Forecast" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl">Next 30 days in checking</h2>
            <span className="text-[13px] text-muted">paychecks minus bills</span>
          </div>
          {checking.map((a) => (
            <div key={a.id}>
              {checking.length > 1 && <h3 className="text-sm">{a.nickname}</h3>}
              <ForecastChart points={result.accountForecasts[a.id] ?? []} />
            </div>
          ))}
        </Card>
        <Card label="Bills and subscriptions" className="min-w-0 flex-[1_1_420px]">
          <ObligationsList obligations={picture.obligations} onToggle={toggleTag} />
        </Card>
      </div>
    </>
  );
}

function PageTitle({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>My Money</Eyebrow>
        <h1 className="m-0 text-[32px]">Hi {name}, here’s your money today</h1>
      </div>
      <p className="m-0 text-sm text-muted">Synced with your bank</p>
    </div>
  );
}

function SmallCard({ label, value, sub, small = false }: { label: string; value: string; sub: string; small?: boolean }) {
  return (
    <div className="box-border flex flex-[1_1_200px] flex-col gap-1.5 rounded-[14px] border border-line bg-surface p-5">
      <Eyebrow>{label}</Eyebrow>
      <span className={`font-display font-semibold ${small ? 'text-xl' : 'text-[28px]'}`}>{value}</span>
      <span className="text-[13px] text-muted">{sub}</span>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5" />
      <path d="M12 18h.01" />
    </svg>
  );
}
