'use client';

import { useState } from 'react';
import type { FinancialPicture, Txn } from '@/lib/types';
import { DEMO_ASOF, getPerson } from '@/lib/demo/people';
import { useViewer } from '@/lib/viewer';
import { scoreHealth } from '@/lib/engine/health';
import { freeSavings } from '@/lib/engine/source';
import { dayDate, money, money0 } from '@/lib/format';
import { AddPurchase, type NewPurchase } from '@/components/AddPurchase';
import { ForecastChart } from '@/components/ForecastChart';
import { IndicatorList } from '@/components/IndicatorList';
import { ObligationsList } from '@/components/ObligationsList';
import { ScoreGauge } from '@/components/ScoreGauge';
import { Card, Eyebrow, StatusPill, btn2 } from '@/components/ui';

// What the user changed in this session, per person. (Later: saved through the API.)
interface Edits {
  purchases: Txn[];
  goalSpend: Record<string, number>;
  tags: Record<string, boolean>;
  trigger: string;
  checkedAt: string | null;
}
const NO_EDITS: Edits = { purchases: [], goalSpend: {}, tags: {}, trigger: 'data synced', checkedAt: null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const nowLabel = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function applyEdits(picture: FinancialPicture, edits: Edits): FinancialPicture {
  let accounts = picture.accounts;
  for (const t of edits.purchases) {
    accounts = accounts.map((a) => (a.id === t.accountId ? { ...a, balance: round2(a.balance - t.amount) } : a));
  }
  return {
    ...picture,
    accounts,
    txns: [...picture.txns, ...edits.purchases],
    goals: picture.goals.map((g) => ({ ...g, amount: Math.max(0, round2(g.amount - (edits.goalSpend[g.id] ?? 0))) })),
    obligations: picture.obligations.map((o) => (o.key in edits.tags ? { ...o, essential: edits.tags[o.key] } : o)),
  };
}

export default function DashboardPage() {
  const { viewerId } = useViewer();
  const person = getPerson(viewerId);
  const [editsBy, setEditsBy] = useState<Record<string, Edits>>({});
  const [rerunNote, setRerunNote] = useState<string | null>(null);

  const edits = editsBy[person.id] ?? NO_EDITS;
  const update = (next: Partial<Edits>) => {
    setEditsBy((all) => ({ ...all, [person.id]: { ...(all[person.id] ?? NO_EDITS), ...next } }));
    setRerunNote(null);
  };

  if (!person.picture) {
    return (
      <>
        <PageTitle name={person.name} />
        <Card>
          <p className="m-0 text-ink-2">{person.name} doesn’t have any accounts yet, so there’s nothing to score.</p>
        </Card>
      </>
    );
  }

  const picture = applyEdits(person.picture, edits);
  const result = scoreHealth(picture, { asOf: DEMO_ASOF, trigger: edits.trigger });

  const addPurchase = (p: NewPurchase) => {
    const isChecking = p.from === 'checking';
    const account = picture.accounts.find((a) => a.type === (isChecking ? 'Checking' : 'Savings'));
    if (!account) return;
    const goalId = !isChecking && p.from !== 'free' ? p.from : null;
    const txn: Txn = {
      id: `new-${person.id}-${edits.purchases.length + 1}`,
      accountId: account.id,
      source: isChecking ? 'checking' : 'savings',
      kind: 'purchase',
      amount: p.amount,
      date: DEMO_ASOF,
      description: p.merchant,
      merchant: p.merchant,
      category: goalId ? `goal:${goalId}` : undefined,
    };
    const where = isChecking ? 'checking' : goalId ? picture.goals.find((g) => g.id === goalId)?.name ?? 'a goal' : 'savings';
    update({
      purchases: [...edits.purchases, txn],
      goalSpend: goalId ? { ...edits.goalSpend, [goalId]: (edits.goalSpend[goalId] ?? 0) + p.amount } : edits.goalSpend,
      trigger: `${money0(p.amount)} purchase at ${p.merchant} (from ${where})`,
      checkedAt: nowLabel(),
    });
  };

  const toggleTag = (key: string) => {
    const current = picture.obligations.find((o) => o.key === key);
    if (!current) return;
    update({ tags: { ...edits.tags, [key]: !current.essential }, trigger: `you re-tagged ${current.name}`, checkedAt: nowLabel() });
  };

  const rerun = () => {
    const at = nowLabel();
    setEditsBy((all) => ({ ...all, [person.id]: { ...edits, checkedAt: at } }));
    setRerunNote(`Re-ran at ${at}. Same data, same score.`);
  };

  const checking = picture.accounts.filter((a) => a.type === 'Checking');
  const savings = picture.accounts.filter((a) => a.type === 'Savings');
  const cards = picture.accounts.filter((a) => a.type === 'Credit Card');
  const setAside = picture.goals.reduce((s, g) => s + g.amount, 0);

  return (
    <>
      <PageTitle name={person.name} />

      {result.flags.length > 0 && (
        <div role="alert" className="flex items-start gap-3.5 rounded-xl border border-[#F2C3BF] bg-bad-bg px-5 py-4 text-[#7A1712]">
          <WarningIcon />
          <div className="flex flex-col gap-1">
            {result.flags.map((f) => (
              <strong key={f}>{f}</strong>
            ))}
            <span className="text-sm">Your score is now {result.score}. See what changed below.</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-5">
        <Card label="Health score" className="flex flex-[1_1_300px] flex-col items-center gap-4 text-center">
          <Eyebrow className="self-start">Health score</Eyebrow>
          <ScoreGauge score={result.score} status={result.overall} />
          <StatusPill status={result.overall} />
          <p className="m-0 text-[13px] leading-normal text-muted">
            Score {result.score}
            {edits.checkedAt ? ` · checked ${edits.checkedAt}` : ''} · after: {edits.trigger}
          </p>
          {rerunNote && <p className="m-0 rounded-lg bg-good-bg px-3 py-2 text-[13px] text-good">{rerunNote}</p>}
          <button type="button" className={`${btn2} mt-auto w-full`} onClick={rerun}>
            Re-run health check
          </button>
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

      <Card label="Add a purchase">
        <h2 className="m-0 mb-3 text-xl">Add a purchase</h2>
        <AddPurchase picture={picture} onAdd={addPurchase} />
        <p className="mt-2 text-xs text-muted">Your health check re-runs automatically.</p>
      </Card>

      <section aria-label="Accounts" className="flex flex-wrap gap-4">
        {checking.map((a) => (
          <SmallCard key={a.id} label={a.nickname} value={money(a.balance)} sub="Everyday spending" />
        ))}
        {savings.map((a) => (
          <SmallCard key={a.id} label={a.nickname} value={money(a.balance)}
            sub={setAside > 0 ? `${money0(setAside)} set aside · ${money0(freeSavings(picture))} free` : 'Nothing set aside yet'} />
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
          <ForecastChart points={result.forecast} />
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
