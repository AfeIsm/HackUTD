'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DeclineReason, FinancialPicture, Source } from '@/lib/types';
import { capacity, checkPledge, fairSplit, shortfall } from '@/lib/engine/split';
import { freeSavings } from '@/lib/engine/source';
import { money, money0, shortDate } from '@/lib/format';
import { DEMO_ASOF, getPerson } from '@/lib/people';
import {
  type Huddle, type Participant, agree, cancelHuddle, decline, editHuddle, payers, publicParticipants,
  respondToInvite, submitPledge, totalPledged, useHuddleStore,
} from '@/lib/huddles';
import { usePictures } from '@/lib/usePicture';
import { useViewer } from '@/lib/viewer';
import { Avatar, Card, Eyebrow, Pill, btn, btn2, input } from './ui';

const STEPS = ['Pledge privately', 'Reveal', 'Agree', 'Locked'];
const STAGE = { pledging: 0, revealed: 1, agreeing: 2, locked: 3, cancelled: 3 } as const;
const DECLINE_OPTIONS: [DeclineReason, string][] = [
  ['changeMyAmount', 'I want to change my amount'],
  ['unfairSplit', 'The split feels unfair'],
  ['totalOrDate', 'The total or date doesn’t work'],
  ['out', 'I’m out'],
];

export function HuddleDetail({ id }: { id: string }) {
  const { viewerId } = useViewer();
  const me = getPerson(viewerId);
  const store = useHuddleStore();
  const h = store.huddles.find((x) => x.id === id);
  const withAccounts = h ? h.participants.map((p) => p.memberId).filter((m) => getPerson(m).hasAccounts) : [];
  const pictures = usePictures(withAccounts);

  if (!h) {
    return (
      <Card>
        <p className="m-0 text-ink-2">This huddle doesn’t exist (huddles reset when the page reloads for now).</p>
        <Link href="/huddles" className="mt-2 inline-block font-semibold">← All huddles</Link>
      </Card>
    );
  }

  const pictureOf = (memberId: string): FinancialPicture | null => {
    const s = pictures[memberId];
    return s?.status === 'ready' ? s.picture : null;
  };
  const mine = h.participants.find((p) => p.memberId === me.id);
  const ps = payers(h);
  const committedCount = ps.filter((p) => p.committed).length;
  const total = totalPledged(h);
  const short = shortfall(h.totalCost, [total]);
  const stage = STAGE[h.phase];

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Link href="/huddles" className="py-1.5 text-sm font-semibold no-underline">← All huddles</Link>
        <h1 className="m-0 text-[34px]">{h.name}</h1>
        <p className="m-0 text-ink-2">
          {money0(h.totalCost)} · pay by {shortDate(h.targetDate)} · {h.participants.length} people, {ps.length} paying ·
          round {h.round} of 3
        </p>
      </div>

      <ol aria-label="Huddle progress" className="m-0 flex list-none flex-wrap gap-2 p-0">
        {STEPS.map((label, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`flex flex-[1_1_180px] items-center gap-2.5 rounded-[10px] px-3.5 py-3 text-[15px] font-semibold ${
                current ? 'bg-ink text-white' : done ? 'bg-good-bg text-good' : 'bg-soft text-muted'
              }`}
            >
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-current text-[13px]">
                {done ? '✓' : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {h.message && (
        <div role="status" className="rounded-xl border border-[#F2D9A6] bg-warn-bg px-5 py-4 text-[#5C3A00]">{h.message}</div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Your private panel" className="box-border flex min-w-0 flex-[1_1_420px] flex-col gap-[18px] rounded-[14px] border-2 border-ink bg-surface p-6">
          <div className="flex items-center gap-2">
            <LockIcon />
            <Eyebrow className="text-ink">Only you see this</Eyebrow>
          </div>
          <PrivatePanel h={h} mine={mine} picture={pictureOf(me.id)} meId={me.id} short={short} />
        </section>

        <section aria-label="What the group sees" className="box-border flex min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-[14px] border border-line bg-surface p-6">
          <Eyebrow>What the group sees</Eyebrow>
          {h.phase === 'pledging' ? (
            <Funding
              title={`${committedCount} of ${ps.length} committed`}
              pct={(committedCount / Math.max(ps.length, 1)) * 100}
              note="Amounts stay hidden until everyone has committed."
            />
          ) : (
            <Funding
              title={`Committed ${money0(total)} of ${money0(h.totalCost)}`}
              pct={Math.min(100, (total / h.totalCost) * 100)}
              done={short === 0}
              note={
                h.phase === 'locked'
                  ? 'Locked. Every commitment moves into the trip fund.'
                  : h.phase === 'cancelled'
                    ? 'This huddle was cancelled.'
                    : short > 0
                      ? `${money0(short)} short. Each payer can see a private plan to commit more.`
                      : `Fully funded. ${ps.filter((p) => p.agreed).length} of ${ps.length} have agreed.`
              }
            />
          )}

          <div className="flex flex-col">
            {publicParticipants(h).map((p) => {
              const raw = h.participants.find((x) => x.memberId === p.memberId)!;
              const person = getPerson(p.memberId);
              const status = !p.isPaying
                ? ['Not paying', 'bg-hover text-muted']
                : !raw.joined
                  ? ['Invited', 'bg-hover text-ink-2']
                  : h.phase === 'locked'
                    ? ['Locked', 'bg-ink text-white']
                    : p.agreed
                      ? ['Agreed', 'bg-good-bg text-good']
                      : h.phase === 'agreeing'
                        ? ['Deciding', 'bg-warn-bg text-warn']
                        : p.committed
                          ? ['Committed', 'bg-good-bg text-good']
                          : ['Not yet', 'bg-hover text-ink-2'];
              return (
                <div key={p.memberId} className="flex items-center gap-3 border-t border-[#EFEFEA] py-3">
                  <Avatar initial={person.initial} color={person.color} size={36} />
                  <span className="min-w-0 flex-1 font-semibold">{p.memberId === me.id ? `${p.name} (you)` : p.name}</span>
                  <span className="min-w-[70px] text-right font-display font-semibold">
                    {p.pledge !== null ? money0(p.pledge) : p.isPaying ? '—' : ''}
                  </span>
                  <Pill className={`min-w-24 justify-center ${status[1]}`}>{status[0]}</Pill>
                </div>
              );
            })}
          </div>

          {h.lastDecline === 'unfairSplit' && h.phase !== 'locked' && (
            <FairSplit h={h} pictureOf={pictureOf} />
          )}

          {h.phase === 'locked' && (
            <div className="flex flex-col gap-2 rounded-xl bg-bg p-4">
              <Eyebrow>Transfers to the {h.name} fund</Eyebrow>
              {ps.map((p) => (
                <div key={p.memberId} className="flex justify-between gap-3 py-1 text-sm">
                  <span>{getPerson(p.memberId).name} → trip fund</span>
                  <span className="font-semibold">
                    {money0(p.pledge ?? 0)} · <span className="text-good">Scheduled</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function PrivatePanel({ h, mine, picture, meId, short }: { h: Huddle; mine?: Participant; picture: FinancialPicture | null; meId: string; short: number }) {
  const store = useHuddleStore();
  const [changing, setChanging] = useState(false);
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);

  if (!mine) return <p className="m-0 text-ink-2">You’re not part of this huddle.</p>;
  if (!mine.joined) {
    const invite = store.invites.find((i) => i.huddleId === h.id && i.toId === meId && i.status === 'pending');
    return (
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-[22px]">You’re invited</h2>
        <p className="m-0 text-ink-2">Accept to join. You’ll pick your own amount, and it’s checked privately against your finances.</p>
        {invite && (
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => respondToInvite(invite.id, true)}>Accept and join</button>
            <button type="button" className={btn2} onClick={() => respondToInvite(invite.id, false)}>Decline</button>
          </div>
        )}
      </div>
    );
  }
  if (!mine.isPaying) return <p className="m-0 text-ink-2">You’re coming along. You’re not paying for this one.</p>;
  if (h.phase === 'cancelled') return <p className="m-0 text-ink-2">This huddle was cancelled. Nothing was charged.</p>;
  if (!picture) return <p className="m-0 text-ink-2">Loading your accounts…</p>;

  const isCreator = h.createdBy === meId;
  const sourceText = mine.source === 'checking' ? 'checking' : mine.goalId ? 'your trip fund' : 'savings';

  if (h.phase === 'locked') {
    return (
      <div className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[22px]">Locked</h2>
        <p className="m-0 leading-relaxed text-ink-2">
          Your {money0(mine.pledge ?? 0)} from {sourceText} is going into the {h.name} fund. Your health checks include it from now on.
        </p>
      </div>
    );
  }

  if (!mine.committed || changing) {
    return (
      <div className="flex flex-col gap-4">
        {mine.checkPassed === false && mine.feedback && !changing && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-bad-bg p-4 text-[#7A1712]">
            <strong className="text-[17px]">
              {money0(mine.pledge ?? 0)} from {sourceText} didn’t pass your health check.
            </strong>
            <span className="text-sm leading-normal">{mine.feedback}</span>
          </div>
        )}
        {mine.suggestion && !changing && (
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Suggestion</Eyebrow>
            <p className="m-0 text-lg font-semibold leading-snug">{mine.suggestion.text}</p>
            <button
              type="button"
              className={`${btn} self-start`}
              onClick={() => {
                const pledge = { amount: mine.suggestion!.amount, source: 'checking' as Source };
                submitPledge(h.id, meId, pledge, checkPledge(picture, pledge, h.targetDate, DEMO_ASOF));
              }}
            >
              Use this
            </button>
          </div>
        )}
        <PledgeForm
          h={h}
          picture={picture}
          initial={mine.pledge ?? undefined}
          onSubmit={(pledge) => {
            submitPledge(h.id, meId, pledge, checkPledge(picture, pledge, h.targetDate, DEMO_ASOF));
            setChanging(false);
          }}
        />
      </div>
    );
  }

  const committedBox = (
    <div className="flex flex-col gap-1.5 rounded-xl bg-good-bg p-4 text-[#0D5A2E]">
      <strong className="text-[17px]">Committed: {money0(mine.pledge ?? 0)} from {sourceText}</strong>
      <span className="text-sm">{mine.feedback}</span>
    </div>
  );

  const editTotal = isCreator && (h.phase === 'revealed' || h.phase === 'agreeing') && <CreatorControls h={h} />;

  if (h.phase === 'pledging') {
    const waiting = payers(h).filter((p) => !p.committed).length;
    return (
      <div className="flex flex-col gap-3">
        {committedBox}
        <p className="m-0 text-ink-2">Waiting for {waiting} more {waiting === 1 ? 'person' : 'people'}. Amounts are revealed once everyone has committed.</p>
      </div>
    );
  }

  if (h.phase === 'revealed') {
    const room = capacity(picture, h.targetDate, DEMO_ASOF) - (mine.pledge ?? 0);
    const extra = Math.min(room, Math.ceil(short / 50) * 50);
    return (
      <div className="flex flex-col gap-3.5">
        <h2 className="m-0 text-[22px]">{short > 0 ? `The group is ${money0(short)} short` : 'Waiting on a changed pledge'}</h2>
        {committedBox}
        {short > 0 && extra >= 50 && (
          <div className="flex flex-col gap-2 rounded-xl bg-bg p-4">
            <Eyebrow>Your plan to commit more</Eyebrow>
            <p className="m-0 text-[17px] font-semibold leading-snug">
              You can add {money0(extra)} and still stay within 10% of your paycheck.
            </p>
            <button
              type="button"
              className={`${btn} self-start`}
              onClick={() => {
                const pledge = { amount: (mine.pledge ?? 0) + extra, source: 'checking' as Source };
                submitPledge(h.id, meId, pledge, checkPledge(picture, pledge, h.targetDate, DEMO_ASOF));
              }}
            >
              Raise my pledge to {money0((mine.pledge ?? 0) + extra)}
            </button>
          </div>
        )}
        {short > 0 && extra < 50 && <p className="m-0 text-sm text-ink-2">You’re already at your limit. Others can raise theirs, or the creator can lower the total.</p>}
        <button type="button" className={`${btn2} self-start`} onClick={() => setChanging(true)}>Change my amount</button>
        {editTotal}
      </div>
    );
  }

  // agreeing
  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="m-0 text-[22px]">{mine.agreed ? 'You agreed' : 'Fully funded. Do you agree?'}</h2>
      {committedBox}
      {mine.agreed ? (
        <p className="m-0 text-ink-2">Waiting for everyone else to agree. Then it locks.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => agree(h.id, meId)}>I agree to everyone’s commitments</button>
            <button type="button" className={btn2} onClick={() => setDeclineReason(declineReason ? null : 'changeMyAmount')}>Request changes</button>
          </div>
          {declineReason && (
            <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-line p-4">
              <legend className="px-1.5 text-sm font-semibold">Why? The group only sees the reason.</legend>
              {DECLINE_OPTIONS.map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line px-3 text-[15px]">
                  <input type="radio" name="why" checked={declineReason === value} onChange={() => setDeclineReason(value)} className="h-[18px] w-[18px]" />
                  {label}
                </label>
              ))}
              <button type="button" className={`${btn2} self-start`} onClick={() => { decline(h.id, meId, declineReason); setDeclineReason(null); }}>
                Send request
              </button>
            </fieldset>
          )}
        </>
      )}
      {editTotal}
    </div>
  );
}

function PledgeForm({ h, picture, initial, onSubmit }: {
  h: Huddle; picture: FinancialPicture; initial?: number; onSubmit: (p: { amount: number; source: Source; goalId?: string }) => void;
}) {
  const [amount, setAmount] = useState(initial ? String(initial) : '');
  const [from, setFrom] = useState('checking');
  const checking = picture.accounts.filter((a) => a.type === 'Checking').reduce((s, a) => s + a.balance, 0);
  const value = Number(amount);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!(value > 0)) return;
        const isChecking = from === 'checking';
        onSubmit({ amount: value, source: isChecking ? 'checking' : 'savings', goalId: !isChecking && from !== 'free' ? from : undefined });
      }}
    >
      <h2 className="m-0 text-[22px]">Your pledge</h2>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Amount
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="900" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Pay from
        <select className={input} value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="checking">Checking, set aside weekly until {shortDate(h.targetDate)} · {money(checking)}</option>
          <option value="free">Savings, not set aside · {money(freeSavings(picture))}</option>
          {picture.goals.map((g) => (
            <option key={g.id} value={g.id}>Savings: {g.name} · {money(g.amount)}</option>
          ))}
        </select>
      </label>
      <button type="submit" className={btn} disabled={!(value > 0)}>Confirm commitment</button>
      <p className="m-0 text-[13px] text-muted">We run your health check with this pledge. If it doesn’t pass, only you see why.</p>
    </form>
  );
}

function CreatorControls({ h }: { h: Huddle }) {
  const [total, setTotal] = useState(String(h.totalCost));
  const [date, setDate] = useState(h.targetDate);
  return (
    <details className="rounded-xl border border-line p-4">
      <summary className="flex min-h-8 cursor-pointer items-center text-sm font-semibold">You created this huddle: change the total or date</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-[1_1_120px] flex-col gap-1.5 text-sm font-semibold">
          Total
          <input className={input} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
          Pay by
          <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className={btn2} onClick={() => Number(total) > 0 && editHuddle(h.id, { totalCost: Number(total), targetDate: date })}>
          Save
        </button>
        <button type="button" className={`${btn2} text-bad`} onClick={() => cancelHuddle(h.id)}>Cancel huddle</button>
      </div>
    </details>
  );
}

function FairSplit({ h, pictureOf }: { h: Huddle; pictureOf: (id: string) => FinancialPicture | null }) {
  const caps: Record<string, number> = {};
  for (const p of payers(h)) {
    const pic = pictureOf(p.memberId);
    if (!pic) return null;
    caps[p.memberId] = capacity(pic, h.targetDate, DEMO_ASOF);
  }
  const split = fairSplit(h.totalCost, caps);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-accent-bg p-4">
      <Eyebrow className="text-[#1A3E9E]">Suggested fair split</Eyebrow>
      <p className="m-0 text-sm text-ink-2">Based on what each person can comfortably set aside. Only the amounts are shared.</p>
      {Object.entries(split).map(([id, amount]) => (
        <div key={id} className="flex justify-between py-0.5 text-sm">
          <span>{getPerson(id).name}</span>
          <strong>{money0(amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function Funding({ title, pct, note, done = false }: { title: string; pct: number; note: string; done?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 text-[26px]">{title}</h2>
      <div className="h-2.5 overflow-hidden rounded-full bg-soft">
        <div className={`h-2.5 transition-[width] duration-500 ${done ? 'bg-good-ring' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="m-0 text-sm text-muted">{note}</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
