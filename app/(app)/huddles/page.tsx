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
import { Avatar, Card, Eyebrow, Pill, btn, btn2, input } from '@/components/ui';
import { BudgetNote, useBudgetCheck } from '@/components/BudgetCheck';

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
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Group purchases</Eyebrow>
          <h1 className="m-0 text-[32px]">Huddles</h1>
        </div>
        <a className={btn} href="#new">New huddle</a>
      </div>

      {invites.map((h) => {
        const from = h.participants.find((p) => p.memberId === h.createdBy)?.name ?? 'Someone';
        return (
          <section key={h.id} aria-label="Invite" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#BFD0F5] bg-accent-bg p-6">
            <div className="flex flex-col gap-1">
              <Eyebrow className="text-[#1A3E9E]">Invite</Eyebrow>
              <strong className="text-[17px]">{from} invited you to “{h.name}”</strong>
              <span className="text-sm text-ink-2">
                {money0(h.totalCost)} total · by {shortDate(h.targetDate)} · {h.participants.length} people
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btn2} onClick={() => void huddleAction(h.id, { action: 'answerInvite', accept: false })}>Decline</button>
              <Link href={`/huddles/${h.id}`} className={btn}>View invite</Link>
            </div>
          </section>
        );
      })}

      {huddlesState.status === 'loading' && <p className="m-0 text-muted">Loading huddles…</p>}
      {huddlesState.status === 'error' && <p className="m-0 text-bad">Couldn’t load your huddles. Refresh to try again.</p>}

      <section aria-label="My huddles" className="flex flex-wrap gap-5">
        {huddlesState.status === 'ready' && mine.length === 0 && <Card className="flex-1"><p className="m-0 text-ink-2">No huddles yet. Start one below.</p></Card>}
        {mine.map((h) => {
          const committed = h.committedCount;
          const revealed = h.totalCommitted !== null;
          const pct = revealed ? Math.min(100, ((h.totalCommitted ?? 0) / h.totalCost) * 100) : (committed / Math.max(h.payingCount, 1)) * 100;
          return (
            <Link
              key={h.id}
              href={`/huddles/${h.id}`}
              className="box-border flex flex-[1_1_320px] flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-6 text-ink no-underline hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 text-[22px]">{h.name}</h2>
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
                    ? 'Plan locked · funding pending'
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
        className="box-border flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-6"
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
        <h2 className="m-0 text-[22px]">Start a huddle</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-[2_1_260px] flex-col gap-1.5 text-sm font-semibold">
            What are you planning?
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={budget.check} placeholder="Beach weekend" />
          </label>
          <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
            Total cost
            <input className={input} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} onBlur={budget.check} placeholder="1200" />
          </label>
          <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold">
            Pay by
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <BudgetNote state={budget.state} />
        <div className="flex flex-col">
          <h3 className="m-0 text-[17px]">Who’s coming</h3>
          <p className="m-0 mb-1 text-[13px] text-muted">Uncheck anyone who isn’t coming. They won’t be added or invited.</p>
          {candidates.map((id) => {
            const p = personFor(id);
            const isFriend = connections?.friends.some((f) => f.memberId === id) ?? false;
            const on = isPaying(id);
            const here = isComing(id);
            return (
              <div key={id} className="flex items-center gap-3.5 border-t border-[#EFEFEA] py-3">
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
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${p.name} is paying`}
                      onClick={() => setPaying({ ...paying, [id]: !on })}
                      className={`relative h-[30px] w-[52px] flex-none cursor-pointer rounded-full border-0 p-0 ${on ? 'bg-accent' : 'bg-[#B9BDC6]'}`}
                    >
                      <span className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-[left]" style={{ left: on ? 25 : 3 }} />
                    </button>
                  </>
                ) : <span className="text-sm text-muted">Not coming</span>}
              </div>
            );
          })}
          <Link href="/friends" className="inline-block py-3 text-[15px] font-semibold">+ Add a friend by username</Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">Each payer pledges privately. Nobody sees amounts until everyone has committed.</span>
          <button type="submit" className={btn} disabled={!valid || busy}>{busy ? 'Creating…' : 'Create huddle'}</button>
        </div>
        {error && <p role="alert" className="m-0 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      </form>
    </>
  );
}
