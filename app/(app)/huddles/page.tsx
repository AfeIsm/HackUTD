'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { parseMoney } from '@/lib/engine/money';
import { money0, shortDate } from '@/lib/format';
import { HOUSEHOLD_IDS, getPerson } from '@/lib/people';
import { createHuddle, friendsOf, payers, respondToInvite, totalPledged, useHuddleStore } from '@/lib/huddles';
import { useViewer } from '@/lib/viewer';
import { Avatar, Card, Eyebrow, Pill, btn, btn2, input } from '@/components/ui';

const PHASE_LABEL = {
  pledging: { label: 'Pledging', className: 'bg-warn-bg text-warn' },
  revealed: { label: 'Revealed', className: 'bg-accent-bg text-accent' },
  agreeing: { label: 'Agreeing', className: 'bg-accent-bg text-accent' },
  locked: { label: 'Locked', className: 'bg-good-bg text-good' },
  cancelled: { label: 'Cancelled', className: 'bg-hover text-muted' },
} as const;

export default function HuddlesPage() {
  const { viewerId } = useViewer();
  const me = getPerson(viewerId);
  const store = useHuddleStore();
  const router = useRouter();

  const mine = store.huddles.filter((h) => h.participants.some((p) => p.memberId === me.id && p.joined));
  const invites = store.invites.filter((i) => i.toId === me.id && i.status === 'pending' && i.huddleId);

  // create form: household + accepted friends
  const candidates = [...(me.role === 'friend' ? [me.id] : HOUSEHOLD_IDS), ...friendsOf(store, me.id)].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [paying, setPaying] = useState<Record<string, boolean>>({});
  const isPaying = (id: string) => paying[id] ?? getPerson(id).roleLabel !== 'Dependent · 10';
  const valid = name.trim() && (parseMoney(total) ?? 0) > 0 && date;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Group purchases</Eyebrow>
          <h1 className="m-0 text-[32px]">Huddles</h1>
        </div>
        <a className={btn} href="#new">New huddle</a>
      </div>

      {invites.map((inv) => {
        const h = store.huddles.find((x) => x.id === inv.huddleId);
        if (!h) return null;
        return (
          <section key={inv.id} aria-label="Invite" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#BFD0F5] bg-accent-bg p-6">
            <div className="flex flex-col gap-1">
              <Eyebrow className="text-[#1A3E9E]">Invite</Eyebrow>
              <strong className="text-[17px]">{getPerson(inv.fromId).name} invited you to “{h.name}”</strong>
              <span className="text-sm text-ink-2">
                {money0(h.totalCost)} total · by {shortDate(h.targetDate)} · {h.participants.length} people
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btn2} onClick={() => respondToInvite(inv.id, false)}>Decline</button>
              <button type="button" className={btn} onClick={() => respondToInvite(inv.id, true)}>Accept</button>
            </div>
          </section>
        );
      })}

      <section aria-label="My huddles" className="flex flex-wrap gap-5">
        {mine.length === 0 && <Card className="flex-1"><p className="m-0 text-ink-2">No huddles yet. Start one below.</p></Card>}
        {mine.map((h) => {
          const ps = payers(h);
          const committed = ps.filter((p) => p.committed).length;
          const revealed = h.phase !== 'pledging';
          const pct = revealed ? Math.min(100, (totalPledged(h) / h.totalCost) * 100) : (committed / Math.max(ps.length, 1)) * 100;
          return (
            <Link
              key={h.id}
              href={`/huddles/${h.id}`}
              className="box-border flex flex-[1_1_320px] flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-6 text-ink no-underline hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 text-[22px]">{h.name}</h2>
                <Pill className={PHASE_LABEL[h.phase].className}>{PHASE_LABEL[h.phase].label}</Pill>
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
                      ? `${money0(totalPledged(h))} of ${money0(h.totalCost)} committed`
                      : `${committed} of ${ps.length} committed`}
                </span>
                <span className="text-muted">{h.participants.length} people · {ps.length} paying</span>
              </div>
            </Link>
          );
        })}
      </section>

      <form
        id="new"
        className="box-border flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-6"
        aria-label="New huddle"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const id = createHuddle({
            name: name.trim(), totalCost: parseMoney(total) ?? 0, targetDate: date, createdBy: me.id,
            members: candidates.map((id) => ({ id, isPaying: isPaying(id) })),
          });
          router.push(`/huddles/${id}`);
        }}
      >
        <h2 className="m-0 text-[22px]">Start a huddle</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-[2_1_260px] flex-col gap-1.5 text-sm font-semibold">
            What are you planning?
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Beach weekend" />
          </label>
          <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
            Total cost
            <input className={input} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="1200" />
          </label>
          <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold">
            Pay by
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-col">
          <h3 className="m-0 mb-1 text-[17px]">Who’s coming</h3>
          {candidates.map((id) => {
            const p = getPerson(id);
            const on = isPaying(id);
            return (
              <div key={id} className="flex items-center gap-3.5 border-t border-[#EFEFEA] py-3">
                <Avatar initial={p.initial} color={p.color} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
                  <span className="text-[13px] text-muted">{p.roleLabel}</span>
                </div>
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
              </div>
            );
          })}
          <Link href="/friends" className="inline-block py-3 text-[15px] font-semibold">+ Add a friend by phone number</Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">Each payer pledges privately. Nobody sees amounts until everyone has committed.</span>
          <button type="submit" className={btn} disabled={!valid}>Create huddle</button>
        </div>
      </form>
    </>
  );
}
