'use client';

// One huddle. Everything comes from the server, already privacy-filtered for this viewer:
// other people's pledges are hidden until reveal; source accounts, check results and
// feedback of others never reach this browser. Actions are POSTed and run on the server.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DeclineReason, FinancialPicture } from '@/lib/types';
import type { HuddleClientView, Participant } from '@/lib/huddles';
import { capacity } from '@/lib/engine/split';
import { fundingOptions } from '@/lib/fundingOptions';
import { parseMoney } from '@/lib/engine/money';
import { money0, shortDate } from '@/lib/format';
import { DEMO_ASOF, lookOf } from '@/lib/people';
import { invalidatePicture, usePicture } from '@/lib/usePicture';
import { huddleAction, useHuddles } from '@/lib/useHuddles';
import { useViewer } from '@/lib/viewer';
import { PledgeCoach } from './PledgeCoach';
import { PurchasePanel } from './PurchasePanel';
import { TransferNow } from './TransferNow';
import { Avatar, Card, Eyebrow, Pill, btn, btn2, input } from './ui';
import { PageShell } from './wallet/PageShell';

const STEPS = ['Pledge privately', 'Reveal', 'Agree', 'Locked'];
const STAGE = { pledging: 0, revealed: 1, agreeing: 2, locked: 3, cancelled: 3 } as const;
const DECLINE_OPTIONS: [DeclineReason, string][] = [
  ['changeMyAmount', 'I want to change my amount'],
  ['unfairSplit', 'The split feels unfair'],
  ['totalOrDate', 'The total or date doesn’t work'],
  ['out', 'I’m out'],
];

type Run = (body: Record<string, unknown>) => Promise<void>;

export function HuddleDetail({ id }: { id: string }) {
  const { viewerId } = useViewer();
  const router = useRouter();
  const state = useHuddles();
  const loaded = usePicture(viewerId); // my own picture only (for the pledge form)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return <PageShell id="huddles" eyebrow="Group purchases" title="Huddle"><Card><p className="text-ink-2">Loading huddle…</p></Card></PageShell>;
  const h = state.status === 'ready' ? state.huddles.find((x) => x.id === id) : undefined;
  if (!h) {
    return (
      <PageShell id="huddles" eyebrow="Group purchases" title="Huddle"><Card>
        <p className="m-0 text-ink-2">{state.status === 'error' ? 'Couldn’t load this huddle. Refresh to try again.' : 'This huddle doesn’t exist, or you’re not part of it.'}</p>
        <Link href="/huddles" className="mt-2 inline-block font-semibold">← All huddles</Link>
      </Card></PageShell>
    );
  }

  // Browsers keep one login per site: a second account logging in elsewhere replaces this tab's.
  if (h.me && h.me.memberId !== viewerId) {
    return (
      <PageShell id="huddles" title="This browser switched accounts"><Card className="flex flex-col gap-3">
        <p className="m-0 text-ink-2">Another account logged in on this browser, so this tab can’t show your view anymore. To test two people at once, use a private window or a second browser for the other account.</p>
        <button type="button" className={`${btn} self-start`} onClick={() => window.location.reload()}>Reload as the current account</button>
      </Card></PageShell>
    );
  }

  const run: Run = async (body) => {
    setBusy(true);
    const result = await huddleAction(h.id, body);
    setError(result.error);
    if (!result.error && body.action === 'transferNow') invalidatePicture(viewerId); // show the new balance everywhere
    if (!result.error && (body.action === 'leave' || body.action === 'delete' ||
      (body.action === 'requestChanges' && body.reason === 'out') ||
      (body.action === 'answerInvite' && body.accept === false))) router.replace('/huddles');
    setBusy(false);
  };
  const picture = loaded.status === 'ready' ? loaded.picture : null;
  const short = h.shortfall ?? 0;
  const stage = STAGE[h.phase];
  const payersShown = h.participants.filter((p) => p.isPaying);

  return (
    <PageShell id="huddles" eyebrow="Group purchases" title={h.name}
      intro={`${money0(h.totalCost)} · pay by ${shortDate(h.targetDate)} · ${h.participants.length} people, ${h.payingCount} paying · round ${h.round} of 3`}
      actions={<>
          <button type="button" className={btn2} disabled={busy} onClick={() => void run({ action: 'leave' })}>Leave huddle</button>
          {h.createdBy === viewerId && <button type="button" className={`${btn2} text-bad`} disabled={busy} onClick={() => void run({ action: 'delete' })}>Delete huddle for everyone</button>}
      </>}>
      <div className="grid gap-6">
      <Link href="/huddles" className="py-1.5 text-sm font-semibold no-underline">← All huddles</Link>

      <ol aria-label="Huddle progress" className="m-0 flex list-none flex-wrap gap-2 p-0">
        {STEPS.map((label, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ${
                current ? 'bg-ink text-white' : done ? 'bg-good-bg text-good' : 'bg-soft text-muted'
              }`}
            >
              {done ? '✓' : i + 1}. {label}
            </li>
          );
        })}
      </ol>

      <RiskBanner h={h} />
      {h.message && (
        <p role="status" className="m-0 rounded-xl border border-line bg-surface px-4 py-3 text-[15px]">
          {h.message}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      <PurchasePanel h={h} isCreator={h.createdBy === viewerId} run={run} busy={busy} />

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Your private panel" className="paper-card flex min-w-0 flex-[1_1_420px] flex-col gap-[18px] border-2 border-ink">
          <div className="flex items-center gap-2">
            <LockIcon />
            <Eyebrow className="text-ink">Only you see this</Eyebrow>
          </div>
          <PrivatePanel h={h} mine={h.me} picture={picture} isCreator={h.createdBy === viewerId} short={short} run={run} busy={busy} />
        </section>

        <section aria-label="What the group sees" className="paper-card flex min-w-0 flex-[1_1_460px] flex-col gap-4">
          <Eyebrow>What the group sees</Eyebrow>
          {h.phase === 'pledging' ? (
            <Funding
              title={`${h.committedCount} of ${h.payingCount} committed`}
              pct={(h.committedCount / Math.max(h.payingCount, 1)) * 100}
              note="Amounts stay hidden until everyone has committed."
            />
          ) : (
            <Funding
              title={`Committed ${money0(h.totalCommitted ?? 0)} of ${money0(h.totalCost)}`}
              pct={Math.min(100, ((h.totalCommitted ?? 0) / h.totalCost) * 100)}
              done={short === 0}
              note={
                h.phase === 'locked'
                  ? h.transferredTotal > 0
                    ? `Plan locked. ${money0(h.transferredTotal)} has been transferred so far. The rest is saved as promises.`
                    : 'Plan locked. Everyone’s amount is saved as a promise. No money has moved.'
                  : h.phase === 'cancelled'
                    ? 'This huddle was cancelled.'
                    : short > 0
                      ? `${money0(short)} short. Each payer can see a private plan to commit more.`
                      : `Fully pledged. ${h.participants.filter((p) => p.isPaying && p.agreed).length} of ${h.payingCount} have agreed.`
              }
            />
          )}

          <div className="flex flex-col">
            {h.participants.map((p) => {
              const look = lookOf(p.name, p.memberId);
              const status = !p.isPaying
                ? ['Not paying', 'bg-hover text-muted']
                : !p.joined
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
                  <Avatar initial={look.initial} color={look.color} size={36} />
                  <span className="min-w-0 flex-1 font-semibold">{p.memberId === viewerId ? `${p.name} (you)` : p.name}</span>
                  <span className="min-w-[70px] text-right font-display font-semibold">
                    {p.pledge !== null ? money0(p.pledge) : p.isPaying ? '—' : ''}
                  </span>
                  <Pill className={`min-w-24 justify-center ${status[1]}`}>{status[0]}</Pill>
                </div>
              );
            })}
          </div>

          {h.fairSplit && (
            <div className="flex flex-col gap-2 rounded-xl bg-accent-bg p-4">
              <Eyebrow className="text-[#1A3E9E]">Suggested fair split</Eyebrow>
              <p className="m-0 text-sm text-ink-2">Based on what each person can comfortably set aside. Only the amounts are shared.</p>
              {h.fairSplit.map((s) => (
                <div key={s.memberId} className="flex justify-between py-0.5 text-sm">
                  <span>{s.name}</span>
                  <strong>{money0(s.amount)}</strong>
                </div>
              ))}
            </div>
          )}

          {h.phase === 'locked' && (
            <div className="flex flex-col gap-2 rounded-xl bg-bg p-4">
              <Eyebrow>Promised to {h.name}</Eyebrow>
              {payersShown.map((p) => (
                <div key={p.memberId} className="flex justify-between gap-3 py-1 text-sm">
                  <span>{p.name}</span>
                  <span className="font-semibold">
                    {money0(p.pledge ?? 0)} · <span className={p.transferred ? 'text-good' : 'text-muted'}>{p.transferred ? 'Transferred' : 'Promised'}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </PageShell>
  );
}

function PrivatePanel({ h, mine, picture, isCreator, short, run, busy }: {
  h: HuddleClientView; mine: Participant | null; picture: FinancialPicture | null; isCreator: boolean; short: number; run: Run; busy: boolean;
}) {
  const [changing, setChanging] = useState(false);
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);

  if (!mine) return <p className="m-0 text-ink-2">You’re not part of this huddle.</p>;
  if (!mine.joined) {
    const from = h.participants.find((p) => p.memberId === h.createdBy)?.name ?? 'Someone';
    return (
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-[22px]">{from} invited you</h2>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 leading-normal text-ink-2">
          <li>You choose your own amount and which account it comes from.</li>
          <li>Wallet Whisperer checks it against your own finances, privately.</li>
          <li>Nobody sees amounts until everyone has committed.</li>
        </ul>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => void run({ action: 'answerInvite', accept: true })}>Accept and join</button>
          <button type="button" className={btn2} disabled={busy} onClick={() => void run({ action: 'answerInvite', accept: false })}>Decline</button>
        </div>
      </div>
    );
  }
  if (!mine.isPaying) return <p className="m-0 text-ink-2">You’re coming along. You’re not paying for this one.</p>;
  if (h.phase === 'cancelled') return <p className="m-0 text-ink-2">This huddle was cancelled. Nothing was charged.</p>;
  if (!picture) return <p className="m-0 text-ink-2">Loading your accounts…</p>;

  const sourceText = picture.accounts.find((a) => a.id === mine.sourceAccountId)?.nickname ?? 'your selected account';
  const checking = picture.accounts.find((a) => a.type === 'Checking')?.id ?? '';
  const pledge = (amount: number, sourceAccountId: string, goalId?: string) => run({ action: 'pledge', amount, sourceAccountId, goalId });

  if (h.phase === 'locked') {
    return (
      <div className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[22px]">Locked</h2>
        <p className="m-0 leading-relaxed text-ink-2">
          {mine.transfer?.status === 'sent'
            ? `Your part of ${h.name} is done.`
            : `You’ve promised ${money0(mine.pledge ?? 0)} from ${sourceText} to ${h.name}. No money has moved, so you can still spend it. We’ll warn you if that puts this promise at risk.`}
        </p>
        {mine.pledge ? <TransferNow mine={mine} huddleName={h.name} sourceText={sourceText} busy={busy} onTransfer={() => run({ action: 'transferNow' })} /> : null}
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
            {!mine.advice && <span className="text-sm leading-normal">{mine.feedback}</span>}
          </div>
        )}
        {mine.checkPassed === false && mine.advice && !changing && (
          <PledgeCoach mine={mine} advice={mine.advice} busy={busy} onPledge={(amount) => void pledge(amount, mine.sourceAccountId ?? checking, mine.goalId ?? undefined)} />
        )}
        {mine.suggestion && !changing && (
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Suggestion</Eyebrow>
            <p className="m-0 text-lg font-semibold leading-snug">{mine.suggestion.text}</p>
            <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => void pledge(mine.suggestion!.amount, checking)}>
              Use this
            </button>
          </div>
        )}
        <PledgeForm
          picture={picture}
          initial={mine.pledge ?? undefined}
          busy={busy}
          onSubmit={async (p) => {
            await pledge(p.amount, p.sourceAccountId, p.goalId);
            setChanging(false);
          }}
        />
      </div>
    );
  }

  const committedBox = (
    <>
      <div role={mine.warning ? 'alert' : undefined} className={`flex flex-col gap-1.5 rounded-xl p-4 ${mine.warning ? 'bg-warn-bg text-warn' : 'bg-good-bg text-[#0D5A2E]'}`}>
        <strong className="text-[17px]">Committed: {money0(mine.pledge ?? 0)} from {sourceText}</strong>
        <span className="text-sm leading-normal">{mine.feedback}</span>
        {mine.warning && h.phase === 'pledging' && (
          <button type="button" className={`${btn2} mt-1 self-start`} onClick={() => setChanging(true)}>Change my amount</button>
        )}
      </div>
      {mine.warning && mine.advice && (
        <PledgeCoach mine={mine} advice={mine.advice} busy={busy} onPledge={(amount) => void pledge(amount, mine.sourceAccountId ?? checking, mine.goalId ?? undefined)} />
      )}
    </>
  );

  const editTotal = isCreator && (h.phase === 'revealed' || h.phase === 'agreeing') && <CreatorControls h={h} run={run} busy={busy} />;

  if (h.phase === 'pledging') {
    const waiting = h.payingCount - h.committedCount;
    return (
      <div className="flex flex-col gap-3">
        {committedBox}
        <p className="m-0 text-ink-2">Waiting for {waiting} more {waiting === 1 ? 'person' : 'people'}. Amounts are revealed once everyone has committed.</p>
      </div>
    );
  }

  if (h.phase === 'revealed') {
    const room = capacity(picture, h.targetDate, DEMO_ASOF) - (mine.pledge ?? 0);
    const extra = Math.min(room, Math.ceil(short / 5000) * 5000);
    return (
      <div className="flex flex-col gap-3.5">
        <h2 className="m-0 text-[22px]">{short > 0 ? `The group is ${money0(short)} short` : 'Waiting on a changed pledge'}</h2>
        {committedBox}
        {short > 0 && extra >= 5000 && (
          <div className="flex flex-col gap-2 rounded-xl bg-bg p-4">
            <Eyebrow>Your plan to commit more</Eyebrow>
            <p className="m-0 text-[17px] font-semibold leading-snug">You can add {money0(extra)} and stay healthy.</p>
            <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => void pledge((mine.pledge ?? 0) + extra, checking)}>
              Raise my pledge to {money0((mine.pledge ?? 0) + extra)}
            </button>
          </div>
        )}
        {short > 0 && extra < 5000 && <p className="m-0 text-sm text-ink-2">You’re already at your limit. Others can raise theirs, or the creator can lower the total.</p>}
        <button type="button" className={`${btn2} self-start`} onClick={() => setChanging(true)}>Change my amount</button>
        {editTotal}
      </div>
    );
  }

  // agreeing
  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="m-0 text-[22px]">{mine.agreed ? 'You agreed' : 'Fully pledged. Do you agree?'}</h2>
      {committedBox}
      {mine.agreed ? (
        <p className="m-0 text-ink-2">Waiting for everyone else to agree. Then it locks.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy || !!h.purchase?.review} onClick={() => void run({ action: 'agree' })}>I agree to everyone’s commitments</button>
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
              <button
                type="button"
                className={`${btn2} self-start`}
                disabled={busy}
                onClick={async () => {
                  await run({ action: 'requestChanges', reason: declineReason });
                  setDeclineReason(null);
                }}
              >
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

function PledgeForm({ picture, initial, busy, onSubmit }: {
  picture: FinancialPicture; initial?: number; busy: boolean; onSubmit: (p: { amount: number; sourceAccountId: string; goalId?: string }) => void;
}) {
  const [amount, setAmount] = useState(initial ? String(initial / 100) : '');
  const [from, setFrom] = useState('checking');
  const options = fundingOptions(picture);
  const selected = options.find((o) => o.value === from) ?? options[0];
  const value = parseMoney(amount) ?? 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!(value > 0) || !selected) return;
        onSubmit({ amount: value, sourceAccountId: selected.sourceAccountId, goalId: selected.goalId });
      }}
    >
      <h2 className="m-0 text-[22px]">Your pledge</h2>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Amount
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="900" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Pay from
        <select className={input} value={selected?.value ?? ''} onChange={(e) => setFrom(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button type="submit" className={btn} disabled={busy || !(value > 0)}>{busy ? 'Checking privately…' : 'Confirm commitment'}</button>
      <p className="m-0 text-[13px] text-muted">The server runs your health check with this pledge. Only you see the result.</p>
    </form>
  );
}

function CreatorControls({ h, run, busy }: { h: HuddleClientView; run: Run; busy: boolean }) {
  const [total, setTotal] = useState(String(h.totalCost / 100));
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
        <button
          type="button"
          className={btn2}
          disabled={busy}
          onClick={() => (parseMoney(total) ?? 0) > 0 && void run({ action: 'edit', totalCost: parseMoney(total) ?? 0, targetDate: date })}
        >
          Save
        </button>
        <button type="button" className={`${btn2} text-bad`} disabled={busy} onClick={() => void run({ action: 'cancel' })}>Cancel huddle</button>
      </div>
    </details>
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

// Shown to EVERYONE in the huddle when a commitment stops passing its health check (even after
// lock). The person it belongs to sees their own numbers; everyone else only sees that one is at risk.
function RiskBanner({ h }: { h: HuddleClientView }) {
  if (h.atRiskCount === 0) return null;
  const mine = h.me?.committed && h.me.atRisk ? h.me : null;
  const others = h.atRiskCount - (mine ? 1 : 0);
  const after = mine?.riskScore ?? null;
  const color = after === null ? null : after >= 75 ? 'green' : after >= 50 ? 'yellow' : 'red';
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-xl border border-bad-ring bg-bad-bg px-4 py-3 text-[15px] text-bad">
      <strong className="text-[16px]">⚠ This huddle’s plan is no longer affordable</strong>
      {mine && (
        <p className="m-0">
          Your {money0(mine.pledge ?? 0)} commitment no longer fits your finances.
          {after !== null && <> Paying it now would drop your health score to <b>{after} ({color})</b>.</>}
          {mine.riskReason && <> {mine.riskReason}</>} Undo the recent spending or talk to the group before {shortDate(h.targetDate)}.
        </p>
      )}
      {mine && (mine.coach ? (
        <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-ink">
          <span className="text-[13px] font-semibold text-muted">🔒 Nemotron prepared this privately for you (no one else in the huddle sees it)</span>
          <strong className="text-[15px]">{mine.coach.headline}</strong>
          {mine.coach.actions.length > 0 && (
            <ul className="m-0 flex flex-col gap-0.5 pl-5 text-[14px]">{mine.coach.actions.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {mine.coach.firstStep && <span className="text-[14px]"><b>First step:</b> {mine.coach.firstStep}</span>}
          {mine.coach.explanation && <span className="text-[14px] text-ink-2">{mine.coach.explanation}</span>}
          <span className="text-xs text-muted">Score {mine.coach.scoreBefore} → {mine.coach.scoreAfter}, re-checked by our engine.</span>
        </div>
      ) : (
        <span className="text-[13px]">Nemotron is preparing a private plan for you…</span>
      ))}
      {others > 0 && (
        <p className="m-0">
          {mine ? 'Also, ' : ''}{others === 1 ? 'one member’s commitment' : `${others} members’ commitments`} in this huddle {others === 1 ? 'is' : 'are'} no
          longer affordable after a change in their finances. The group may come up short; check in with each other before {shortDate(h.targetDate)}.
        </p>
      )}
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
