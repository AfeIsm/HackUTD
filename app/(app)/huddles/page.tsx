'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { parseMoney } from '@/lib/engine/money';
import { money0, shortDate } from '@/lib/format';
import { PEOPLE, lookOf } from '@/lib/people';
import { useConnections } from '@/lib/useConnections';
import { huddleAction, huddleRequest, useHuddles } from '@/lib/useHuddles';
import { useViewer } from '@/lib/viewer';
import { Avatar, Eyebrow, Pill, btn, btn2, input } from '@/components/ui';
import { BudgetNote, useBudgetCheck } from '@/components/BudgetCheck';
import { PageShell } from '@/components/wallet/PageShell';

const PHASE_LABEL = {
  pledging: { label: 'Pledging', className: 'bg-warn-bg text-warn' },
  revealed: { label: 'Revealed', className: 'bg-accent-bg text-accent' },
  agreeing: { label: 'Agreeing', className: 'bg-accent-bg text-accent' },
  locked: { label: 'Locked', className: 'bg-good-bg text-good' },
  cancelled: { label: 'Cancelled', className: 'bg-hover text-muted' },
} as const;

export default function HuddlesPage() {
  const { person: me } = useViewer();
  const huddlesState = useHuddles();
  const router = useRouter();
  const all = huddlesState.status === 'ready' ? huddlesState.huddles : [];
  const mine = all.filter((h) => h.me?.joined);
  const invites = all.filter((h) => h.me && !h.me.joined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form: household + accepted friends
  // (from Mongo: your household + accepted friends who have money data)
  const conn = useConnections();
  const connections = conn.status === 'ready' ? conn.data : null;
  const candidates = [
    me.id,
    ...(connections?.household?.members ?? []).map((m) => m.memberId),
    ...(connections?.friends ?? []).map((f) => f.memberId),
  ].filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
  const personFor = (id: string) => {
    if (id === me.id) return me;
    const connection = [...(connections?.household?.members ?? []), ...(connections?.friends ?? [])].find((p) => p.memberId === id);
    return { id, name: connection?.name ?? 'Member', ...lookOf(connection?.name ?? 'Member', id),
      roleLabel: PEOPLE.find((p) => p.id === id)?.roleLabel ?? 'Member' };
  };
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [coming, setComing] = useState<Record<string, boolean>>({});
  const isComing = (id: string) => id === me.id || (coming[id] ?? true); // you're always in your own huddle
  const going = candidates.filter(isComing);
  const budget = useBudgetCheck(name, total, date, going.length);
  const [paying, setPaying] = useState<Record<string, boolean>>({});
  const isPaying = (id: string) => paying[id] ?? id !== 'leo';
  const valid = going.length >= 2 && name.trim() && (parseMoney(total) ?? 0) > 0 && date;

  return (
    <PageShell id="huddles" title="Huddles"
      intro="Plan a purchase together. Each person chooses what to contribute while keeping their finances private.">
      <div className="grid gap-6">
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}

      {invites.map((h) => {
        const from = h.participants.find((p) => p.memberId === h.createdBy)?.name ?? 'Someone';
        return (
          <section key={h.id} aria-label="Invite" className="paper-card flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Eyebrow className="text-[#1A3E9E]">Invite</Eyebrow>
              <strong className="text-[17px]">{from} invited you to “{h.name}”</strong>
              <span className="text-sm text-ink-2">
                {money0(h.totalCost)} total · by {shortDate(h.targetDate)} · {h.participants.length} people
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btn2} disabled={busy} onClick={async () => {
                setBusy(true);
                const result = await huddleAction(h.id, { action: 'answerInvite', accept: false });
                setError(result.error);
                setBusy(false);
              }}>Decline</button>
              <Link href={`/huddles/${h.id}`} className={btn}>View invite</Link>
            </div>
          </section>
        );
      })}

      {huddlesState.status === 'loading' && <p className="m-0 text-muted">Loading huddles…</p>}
      {huddlesState.status === 'error' && <p className="m-0 text-bad">Couldn’t load your huddles. Refresh to try again.</p>}

      <section aria-label="My huddles" className="paper-card grid divide-y divide-border">
        {huddlesState.status === 'ready' && mine.length === 0 && <p>No huddles yet. Start one below.</p>}
        {mine.map((h) => {
          const committed = h.committedCount;
          const revealed = h.totalCommitted !== null;
          const pct = revealed ? Math.min(100, ((h.totalCommitted ?? 0) / h.totalCost) * 100) : (committed / Math.max(h.payingCount, 1)) * 100;
          return (
            <Link
              key={h.id}
              href={`/huddles/${h.id}`}
              className="flex min-w-0 flex-col gap-3 py-4 text-ink no-underline first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">{h.name}</h2>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {h.atRiskCount > 0 && <Pill className="bg-bad-bg text-bad">⚠ Not affordable</Pill>}
                  <Pill className={PHASE_LABEL[h.phase].className}>{PHASE_LABEL[h.phase].label}</Pill>
                </div>
              </div>
              <span className="text-[15px] text-ink-2">{money0(h.totalCost)} · by {shortDate(h.targetDate)}</span>
              <div className="h-2 overflow-hidden rounded-full bg-soft">
                <div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span>
                  {h.phase === 'locked'
                    ? 'Plan locked · amounts promised'
                    : revealed
                      ? `${money0(h.totalCommitted ?? 0)} of ${money0(h.totalCost)} committed`
                      : `${committed} of ${h.payingCount} committed`}
                </span>
                <span className="text-muted">{h.participants.length} people · {h.payingCount} paying</span>
              </div>
            </Link>
          );
        })}
      </section>

      <form
        id="new"
        className="paper-card flex min-w-0 flex-col gap-5"
        aria-label="New huddle"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          const res = await huddleRequest('/api/huddles', {
            name: name.trim(), totalCost: parseMoney(total) ?? 0, targetDate: date,
            members: going.map((id) => ({ memberId: id, isPaying: isPaying(id) })),
          });
          setBusy(false);
          setError(res.error);
          if (res.id) router.push(`/huddles/${res.id}`);
        }}
      >
        <h2 className="section-title font-display">Start a huddle</h2>
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr]">
          <label className="grid min-w-0 gap-1 text-sm font-semibold">
            What are you planning?
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={budget.check} placeholder="Beach weekend" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">
            Total cost
            <input className={input} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} onBlur={budget.check} placeholder="1200" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">
            Pay by
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <BudgetNote state={budget.state} />
        <div className="flex flex-col">
          <h3 className="font-display text-xl">Who’s coming</h3>
          <p className="m-0 mb-1 text-[13px] text-muted">Uncheck anyone who isn’t coming. They won’t be added or invited.</p>
          {candidates.map((id) => {
            const p = personFor(id);
            const isFriend = connections?.friends.some((f) => f.memberId === id) ?? false;
            const on = isPaying(id);
            const here = isComing(id);
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 border-t border-border py-3">
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] flex-none"
                  checked={here}
                  disabled={id === me.id}
                  aria-label={`${p.name} is coming`}
                  onChange={(e) => setComing({ ...coming, [id]: e.target.checked })}
                />
                <Avatar initial={p.initial} color={p.color} />
                <div className={`flex min-w-0 flex-1 flex-col ${here ? '' : 'opacity-50'}`}>
                  <span className="font-semibold">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
                  <span className="text-[13px] text-muted">{!here ? 'Not invited' : isFriend ? 'Friend · gets an invite' : p.roleLabel}</span>
                </div>
                {here ? (
                  <>
                    <span className="min-w-20 text-right text-sm text-ink-2">{on ? 'Paying' : 'Coming, not paying'}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      aria-label={`${p.name} is paying`}
                      onChange={(e) => setPaying({ ...paying, [id]: e.target.checked })}
                      className="switch shrink-0"
                    />
                  </>
                ) : <span className="text-sm text-muted">Not coming</span>}
              </div>
            );
          })}
          <Link href="/friends" className="inline-block py-3 text-[15px] font-semibold">+ Add a friend by username</Link>
          {conn.status === 'loading' && <p className="text-sm text-muted">Loading people you can invite…</p>}
          {conn.status === 'error' && <p role="alert" className="text-sm text-bad">Couldn’t load your friends and household. Refresh to try again.</p>}
          {conn.status === 'ready' && candidates.length < 2 && <p className="text-sm text-muted">Add a friend or household member first. At least two people are needed for a huddle.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">Each payer pledges privately. Nobody sees amounts until everyone has committed.</span>
          <button type="submit" className="nvidia-create inline-flex items-center justify-center gap-2 rounded-md font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid || busy}>
            <span aria-hidden="true">＋</span>{busy ? 'Creating…' : 'Create huddle'}
          </button>
        </div>
      </form>
      </div>
    </PageShell>
  );
}
