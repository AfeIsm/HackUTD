'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useConnections, sendConnectionChange } from '@/lib/useConnections';
import { useHousehold } from '@/lib/useHousehold';
import { useHuddles } from '@/lib/useHuddles';
import { useViewer } from '@/lib/viewer';
import { AddByUsername } from '@/components/AddByUsername';
import { PersonRow } from '@/components/PersonRow';
import { RequestCards } from '@/components/RequestCards';
import { HouseholdSharing } from '@/components/HouseholdSharing';
import { HouseholdMemberCard } from '@/components/HouseholdMemberCard';
import { FamilyCarousel, type FamilySlide } from '@/components/FamilyCarousel';
import { lookOf } from '@/lib/people';
import { dayDate } from '@/lib/format';
import { HouseholdAmount } from '@/components/HouseholdAmount';
import { Card, Pill, btn2 } from '@/components/ui';
import { PageShell } from '@/components/wallet/PageShell';

export default function HouseholdPage() {
  const { me } = useViewer();
  const conn = useConnections();
  const data = conn.status === 'ready' ? conn.data : null;
  const household = data?.household ?? null;
  const membershipKey = household ? household.members.map((m) => m.userId).sort().join(':') : '';
  const shared = useHousehold(membershipKey);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  async function leave() {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    const error = await sendConnectionChange('/api/household', 'DELETE', {});
    setLeaveError(error);
    if (!error) shared.clear();
    setLeaving(false);
  }
  const huddlesState = useHuddles();
  const pending = (data?.sent ?? []).filter((r) => r.kind === 'household' && r.status === 'pending');
  const incoming = (data?.incoming ?? []).filter((r) => r.kind === 'household');
  const myUserId = me.status === 'in' ? me.user.id : '';
  const currentShared = shared.data?.household?.owner.userId === household?.owner.userId ? shared.data : null;
  const members = currentShared?.members.filter((m) => household?.members.some((p) => p.userId === m.userId)) ?? [];
  const slides: FamilySlide[] = members.map((member) => {
    const own = member.userId === myUserId;
    const { data } = member;
    const facts: FamilySlide['facts'] = [];
    if (data.balances) {
      for (const type of ['Checking', 'Savings'] as const) {
        const accounts = data.balances.filter((a) => a.type === type);
        if (accounts.length) facts.push({ k: type, v: <HouseholdAmount amount={accounts.reduce((sum, a) => sum + a.balance, 0)} /> });
      }
    }
    if (data.income) facts.push({ k: 'Next payday', v: <>{dayDate(data.income.nextDate)} · <HouseholdAmount amount={data.income.avgAmount} kind="income" /></> });
    const nextBill = data.obligations?.toSorted((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
    if (nextBill) facts.push({ k: 'Next bill', v: <>{nextBill.name} · <HouseholdAmount amount={nextBill.amount} kind="expense" /></> });
    if (data.goals) facts.push({ k: 'Savings goals', v: `${data.goals.length} goals shared` });
    if (data.transactions) facts.push({ k: 'Recent activity', v: `${data.transactions.length} transactions shared` });
    return {
      id: member.userId ?? member.memberId ?? member.name,
      name: `${member.name}${own ? ' (you)' : ''}`,
      roleLabel: member.role === 'owner' ? 'Household owner' : member.role === 'spouse' ? 'Spouse / partner' : 'Dependent',
      ...lookOf(member.name, member.memberId),
      result: data.health ?? null, loading: false,
      summary: member.unavailable ? 'Shared data is temporarily unavailable.'
        : !Object.keys(data).length ? 'Financial details are private.'
        : own ? 'Your financial highlights.' : 'Shared financial highlights.',
      facts: facts.slice(0, 3),
      details: <HouseholdMemberCard member={member} own={own} />,
    };
  });
  const memberIds = household?.members.flatMap((m) => m.memberId ? [m.memberId] : []) ?? [];
  const openHuddles = (huddlesState.status === 'ready' ? huddlesState.huddles : []).filter(
    (h) => h.phase !== 'locked' && h.phase !== 'cancelled' && h.participants.some((p) => memberIds.includes(p.memberId)),
  );

  return <PageShell id="household" title="Household"
    intro={household
      ? 'Each person controls what they share. Joining a household never shares finances automatically.'
      : 'Invite someone by username. They join only after accepting on their own account.'}
    actions={household && <button type="button" className="household-leave min-h-11 rounded-md border px-4 font-semibold disabled:opacity-50"
      disabled={leaving || shared.saving !== null} onClick={() => void leave()}>
          {leaving ? 'Leaving…' : 'Leave household'}
    </button>}>
    <div className="grid gap-6">
    {conn.status !== 'ready' && <Card><p className="text-muted" aria-live="polite">{conn.status === 'error' ? 'Could not load your household. Refresh to try again.' : 'Loading household…'}</p></Card>}
    {leaveError && <p role="alert" className="text-sm text-bad">{leaveError}</p>}
    {household?.iAmOwner && <p className="text-xs text-muted">Leaving passes ownership to the next member and resets sharing to private; if only one member remains, the household closes.</p>}
    <RequestCards requests={incoming} />
    {conn.status === 'ready' && <div className="household-layout">
      {household ? <FamilyCarousel slides={slides} unavailable={Boolean(shared.error)} /> : <section className="household-overview">
        <p className="eyebrow">Household at a glance</p>
        <div className="member-card mt-5"><h2 className="font-display text-2xl">Make room for your people</h2>
          <p className="mt-3 text-muted-foreground">No household yet. Invite a spouse, partner or dependent who has an account. They choose what to share after accepting.</p>
        </div>
      </section>}
      {household && (currentShared
        ? <HouseholdSharing settings={currentShared.settings} saving={shared.saving} onToggle={(scope, enabled) => void shared.toggle(scope, enabled)} />
        : <section className="household-sharing"><h2 className="section-title font-display">What I share with my household</h2>
          {shared.error ? <><p role="alert" className="my-3 text-bad">{shared.error}</p><button type="button" className={btn2} onClick={() => void shared.refresh()}>Refresh sharing</button></>
            : <p className="mt-3 text-muted">Loading sharing preferences…</p>}
        </section>)}
      {(!household || household.iAmOwner) && <AddByUsername kind="household" title="Invite to your household"
        help="They must accept on their own device. Both people choose their own sharing settings after joining. Dependents also need their own account and username." />}
    </div>}
    {household && <>
      {shared.error && currentShared && <p role="alert" className="text-bad">{shared.error}</p>}
      {openHuddles.length > 0 && <Card label="Household huddles">
        <h2 className="section-title mb-3 font-display">Open huddles</h2>
        <div className="flex flex-wrap gap-4">{openHuddles.map((h) => <Link key={h.id} href={`/huddles/${h.id}`} className="font-semibold">{h.name}</Link>)}</div>
      </Card>}
    </>}

    {pending.length > 0 && <Card label="Invites sent" className="min-w-0">
        <h2 className="section-title mb-2 font-display">Invites sent</h2>
        {pending.map((r) => <PersonRow key={r.id} person={r.to} right={<Pill className="bg-warn-bg text-warn">Awaiting acceptance</Pill>} />)}
    </Card>}
    </div>
  </PageShell>;
}
