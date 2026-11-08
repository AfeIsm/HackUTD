'use client';

// The huddle's purchase: Nemotron's live activity, its proposals, and the everyone-must-accept
// review. Everything here is already filtered by the server for this viewer.

import { useState } from 'react';
import type { HuddleClientView, ProposalView } from '@/lib/huddles';
import { money0 } from '@/lib/format';
import { Eyebrow, Pill, btn, btn2, input } from './ui';

type Run = (body: Record<string, unknown>) => Promise<void>;
const STEP_ICON = { plan: '🧭', tool: '🔧', result: '↺', final: '✓' } as const;
const checkedAt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ProposalCard({ p, children }: { p: ProposalView; children?: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-[17px] leading-snug">{p.title}</strong>
          <span className="text-sm text-ink-2">{p.seller}</span>
        </div>
        {p.demo && <Pill className="bg-warn-bg text-warn">Demo data, not a real offer</Pill>}
      </div>
      {p.why && <p className="m-0 text-[15px] text-ink-2">{p.why}</p>}
      <div className="flex flex-col gap-0.5 text-sm">
        {p.lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3">
            <span>{l.label}</span>
            <span className={l.amount === null ? 'text-muted' : 'font-semibold'}>{l.amount === null ? 'Unknown' : money0(l.amount)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-[#EFEFEA] pt-1.5 text-[15px]">
          <strong>{p.basis === 'advertised' ? 'Advertised price' : 'Estimated total'}</strong>
          <strong>{money0(p.total)}</strong>
        </div>
        <span className="text-xs text-muted">Verified total: only available at checkout.</span>
      </div>
      {p.unknownCosts.length > 0 && <p className="m-0 text-sm text-warn"><b>Not included, unknown:</b> {p.unknownCosts.join(', ')}</p>}
      {p.tradeoffs.length > 0 && <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-2">{p.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div className="flex flex-col gap-0.5 text-sm">
        {p.underBudgetBy > 0 && (p.kind === 'rental'
          ? <span className="font-semibold">Leaves {money0(p.underBudgetBy)} for flights, food and activities</span>
          : <span>{money0(p.underBudgetBy)} under budget{p.belowListPriceBy ? ` · ${money0(p.belowListPriceBy)} below list price` : ''}</span>)}
        {p.fundingGap !== null && <span className={p.fundingGap > 0 ? 'font-semibold text-bad' : 'font-semibold text-good'}>{p.fundingGap > 0 ? `${money0(p.fundingGap)} funding gap at current commitments` : 'Fully covered by current commitments'}</span>}
        {p.deliveryText && <span className="text-ink-2">Listed delivery: {p.deliveryText} (not guaranteed)</span>}
      </div>
      <span className="text-xs text-muted">
        {p.link && <><a href={p.link} target="_blank" rel="noopener noreferrer" className="font-semibold">{p.linkIsSearch ? 'Look up this listing' : 'View source'}</a> · </>}
        Checked {checkedAt(p.retrievedAt)}. Price and availability can change.
      </span>
      {children}
    </article>
  );
}

function ReviewBox({ review, run, busy }: { review: NonNullable<NonNullable<HuddleClientView['purchase']>['review']>; run: Run; busy: boolean }) {
  const [saying, setSaying] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <section aria-label="Review this proposal" className="flex flex-col gap-3 rounded-xl border-2 border-ink p-4">
      <Eyebrow className="text-ink">Everyone has to accept this · {review.acceptedCount} of {review.neededCount} so far</Eyebrow>
      <ProposalCard p={review.proposal} />
      <p className="m-0 text-sm text-ink-2">Accepting doesn’t buy anything, move money or change anyone’s pledge.</p>
      {review.iAccepted && <p className="m-0 font-semibold text-good">You accepted. Waiting for everyone else.</p>}
      {review.iMustRespond && !saying && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => void run({ action: 'respondProposal', accept: true })}>Accept this plan</button>
          <button type="button" className={btn2} disabled={busy} onClick={() => setSaying(true)}>No, find something else</button>
        </div>
      )}
      {saying && (
        <form className="flex flex-col gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3) void run({ action: 'respondProposal', accept: false, reason: reason.trim() });
        }}>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Why not? Only Nemotron reads this. The group won’t see who said no or why.
            <textarea className={`${input} h-auto min-h-20 py-2`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="It’s too far from the beach" autoFocus />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btn} disabled={busy || reason.trim().length < 3}>Send and find a new plan</button>
            <button type="button" className={btn2} onClick={() => setSaying(false)}>Back</button>
          </div>
        </form>
      )}
    </section>
  );
}

export function PurchasePanel({ h, isCreator, run, busy }: { h: HuddleClientView; isCreator: boolean; run: Run; busy: boolean }) {
  const purchase = h.purchase;
  if (!purchase) return null;
  const { search, review, selected, searchesLeft } = purchase;
  const open = h.phase !== 'locked' && h.phase !== 'cancelled';
  const running = search?.status === 'running';
  const others = search?.status === 'done' && open ? search.proposals.filter((p) => p.id !== review?.proposal.id) : [];
  return (
    <section aria-label="Cheaper alternatives" className="box-border flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>Cheaper alternatives · Nemotron</Eyebrow>
          <h2 className="m-0 text-[22px]">{selected ? 'The group chose a new plan' : 'The pledges didn’t reach the goal'}</h2>
          {!selected && <p className="m-0 text-sm text-ink-2">Nemotron searched for a way to do this with what the group pledged.</p>}
        </div>
        {isCreator && open && !review && !running && search && searchesLeft > 0 && (
          <button type="button" className={btn2} disabled={busy} onClick={() => void run({ action: 'findOptions' })}>Find other options</button>
        )}
      </div>

      {selected && (
        <div className="flex flex-col gap-2">
          <Eyebrow className="text-good">Accepted by everyone</Eyebrow>
          <ProposalCard p={selected} />
          <p className="m-0 text-sm text-ink-2">Not purchased yet. No money has moved. The group still needs to fund and agree to this before it locks.</p>
        </div>
      )}

      {review && <ReviewBox key={review.proposal.id} review={review} run={run} busy={busy} />}

      {search && search.steps.length > 0 && (
        <ol aria-label="What Nemotron did" aria-live="polite" className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-soft p-3 text-[14px]">
          {search.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden="true" className="w-5 shrink-0 text-center">{STEP_ICON[s.type]}</span>
              <span className="min-w-0">{s.text}</span>
            </li>
          ))}
          {running && <li className="pl-7 text-muted">Working…</li>}
        </ol>
      )}
      {running && !search.steps.length && <p className="m-0 text-sm text-ink-2" aria-live="polite">Nemotron is starting…</p>}
      {search?.usedDemo && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">The live search wasn’t available, so these results are demo data. They are not real prices or listings.</p>}
      {search?.noSolution && <p className="m-0 rounded-xl bg-bad-bg px-4 py-3 text-sm text-[#7A1712]">{search.noSolution}</p>}
      {search?.summary && <p className="m-0 text-[15px]">{search.summary}</p>}

      {review && others.length > 0 && <Eyebrow>Other options Nemotron found</Eyebrow>}
      {others.map((p) => (
        <ProposalCard key={p.id} p={p}>
          {isCreator
            ? <button type="button" className={`${review ? btn2 : btn} self-start`} disabled={busy} onClick={() => void run({ action: 'reviewProposal', proposalId: p.id })}>{review ? 'Ask everyone about this one instead' : 'Send to everyone'}</button>
            : <span className="text-[13px] text-muted">Only the creator can switch to this option.</span>}
        </ProposalCard>
      ))}
    </section>
  );
}
