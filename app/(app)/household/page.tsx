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
import { money, dayDate } from '@/lib/format';
import { Card, Eyebrow, Pill, btn2 } from '@/components/ui';

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
        if (accounts.length) facts.push({ k: type, v: money(accounts.reduce((sum, a) => sum + a.balance, 0)) });
      }
    }
    if (data.income) facts.push({ k: 'Next payday', v: `${dayDate(data.income.nextDate)} · ${money(data.income.avgAmount)}` });
    const nextBill = data.obligations?.toSorted((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
    if (nextBill) facts.push({ k: 'Next bill', v: `${nextBill.name} · ${money(nextBill.amount)}` });
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
        : own ? 'Your main financial highlights. Expand to see your full overview.' : 'Highlights from what this member has chosen to share.',
      facts: facts.slice(0, 3),
      details: <HouseholdMemberCard member={member} own={own} />,
    };
  });
  const memberIds = household?.members.flatMap((m) => m.memberId ? [m.memberId] : []) ?? [];
  const openHuddles = (huddlesState.status === 'ready' ? huddlesState.huddles : []).filter(
    (h) => h.phase !== 'locked' && h.phase !== 'cancelled' && h.participants.some((p) => memberIds.includes(p.memberId)),
  );

  if (conn.status !== 'ready') return <p className="m-0 text-muted">{conn.status === 'error' ? 'Could not load your household. Refresh to try again.' : 'Loading household…'}</p>;

  return <>
    <div className="flex flex-col gap-1.5">
      <Eyebrow>{household && !household.iAmOwner ? `${household.owner.name}'s household` : 'Your household'}</Eyebrow>
      <h1 className="m-0 text-[32px]">Household</h1>
      {household && <div className="flex flex-col items-start gap-2">
        <button type="button" className={`${btn2} text-bad`} disabled={leaving || shared.saving !== null} onClick={() => void leave()}>
          {leaving ? 'Leaving…' : 'Leave household'}
        </button>
        {household.iAmOwner && <p className="m-0 text-xs text-muted">Ownership passes to the next member. Sharing resets to private; if only one member remains, the household closes.</p>}
      </div>}
      {leaveError && <p role="alert" className="m-0 text-sm text-bad">{leaveError}</p>}
      <p className="m-0 text-ink-2">{household
        ? 'Each person controls what they share. Joining a household never shares finances automatically.'
        : 'Invite someone by username. They join only after accepting on their own account.'}</p>
    </div>

    <RequestCards requests={incoming} />

    {household && <>
      <FamilyCarousel slides={slides} />
      {shared.error && <Card><p role="alert" className="m-0 mb-3 text-bad">{shared.error}</p><button type="button" className={btn2} onClick={() => void shared.refresh()}>Refresh sharing</button></Card>}
      {currentShared
        ? <HouseholdSharing settings={currentShared.settings} saving={shared.saving} onToggle={(scope, enabled) => void shared.toggle(scope, enabled)} />
        : !shared.error && <p className="m-0 text-muted">Loading sharing preferences…</p>}
      {openHuddles.length > 0 && <Card label="Household huddles">
        <h2 className="m-0 mb-3 text-[22px]">Open huddles</h2>
        <div className="flex flex-wrap gap-4">{openHuddles.map((h) => <Link key={h.id} href={`/huddles/${h.id}`} className="font-semibold">{h.name}</Link>)}</div>
      </Card>}
    </>}

    {(!household || household.iAmOwner) && <div className="flex flex-wrap items-start gap-5">
      <AddByUsername kind="household" title="Invite to your household" help="They must accept on their own device. Both people choose their own sharing settings after joining." />
      {pending.length > 0 && <Card label="Invites sent" className="flex min-w-0 flex-[999_1_420px] flex-col gap-1">
        <h2 className="m-0 mb-2 text-[22px]">Invites sent</h2>
        {pending.map((r) => <PersonRow key={r.id} person={r.to} right={<Pill className="bg-warn-bg text-warn">Awaiting acceptance</Pill>} />)}
      </Card>}
    </div>}
  </>;
}
