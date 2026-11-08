'use client';

import Link from 'next/link';
import type { FinancialPicture } from '@/lib/types';
import { scoreHealth, monthly } from '@/lib/engine/health';
import { dayDate, money, money0 } from '@/lib/format';
import type { HouseholdMember } from '@/lib/types';
import { DEMO_ASOF, PEOPLE, lookOf } from '@/lib/people';
import { useHuddles } from '@/lib/useHuddles';
import { usePictures } from '@/lib/usePicture';
import { useConnections } from '@/lib/useConnections';
import { useViewer } from '@/lib/viewer';
import { FamilyCarousel, type FamilySlide } from '@/components/FamilyCarousel';
import { AddByUsername } from '@/components/AddByUsername';
import { PersonRow } from '@/components/PersonRow';
import { RequestCards } from '@/components/RequestCards';
import { Card, Eyebrow, Pill } from '@/components/ui';

const ROLE_LABEL = { owner: 'Household owner', spouse: 'Spouse', dependent: 'Dependent' } as const;
const hasAccounts = (m: HouseholdMember) => Boolean(m.memberId && PEOPLE.some((p) => p.id === m.memberId && p.hasAccounts));
const roleLabel = (m: HouseholdMember) => PEOPLE.find((p) => p.id === m.memberId && m.role !== 'owner')?.roleLabel ?? ROLE_LABEL[m.role];

const PER_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };
const monthlyPay = (p: FinancialPicture) => (p.paycheck ? Math.round(p.paycheck.avgAmount * (PER_MONTH[p.paycheck.cadenceDays] ?? 1)) : 0);
const balanceOf = (p: FinancialPicture, type: 'Checking' | 'Savings') =>
  p.accounts.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0);

export default function HouseholdPage() {
  const { viewerId } = useViewer();
  const conn = useConnections();
  const data = conn.status === 'ready' ? conn.data : null;
  const household = data?.household ?? null;
  const members = household?.members ?? [];
  const memberIds = members.flatMap((m) => (m.memberId ? [m.memberId] : []));
  const pictures = usePictures(members.filter(hasAccounts).map((m) => m.memberId as string));
  const huddlesState = useHuddles();
  const pendingInvites = (data?.sent ?? []).filter((r) => r.kind === 'household' && r.status === 'pending');
  const incomingHousehold = (data?.incoming ?? []).filter((r) => r.kind === 'household');

  if (conn.status !== 'ready') {
    return <p className="m-0 text-muted">{conn.status === 'error' ? 'Couldn’t load your household. Refresh to try again.' : 'Loading…'}</p>;
  }

  if (!household) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Your household</Eyebrow>
          <h1 className="m-0 text-[32px]">Household</h1>
          <p className="m-0 text-ink-2">You’re not in a household yet. Start one by inviting your spouse or kids by username.</p>
        </div>
        <RequestCards requests={incomingHousehold} />
        <div className="flex flex-wrap items-start gap-5">
          <AddByUsername kind="household" title="Invite to your household" help="They accept on their own device. You become the household owner." />
          {pendingInvites.length > 0 && (
            <Card label="Invites sent" className="flex min-w-0 flex-[999_1_420px] flex-col gap-1">
              <h2 className="m-0 mb-2 text-[22px]">Invites sent</h2>
              {pendingInvites.map((r) => (
                <PersonRow key={r.id} person={r.to} right={<Pill className="bg-warn-bg text-warn">Waiting</Pill>} />
              ))}
            </Card>
          )}
        </div>
      </>
    );
  }

  const slides: FamilySlide[] = members.map((m) => {
    const id = m.memberId ?? m.userId ?? m.name;
    const person = { ...lookOf(m.name, m.memberId), name: m.name, roleLabel: roleLabel(m), hasAccounts: hasAccounts(m) };
    const state = m.memberId ? pictures[m.memberId] : undefined;
    const picture = state?.status === 'ready' ? state.picture : null;
    const loading = person.hasAccounts && (!state || state.status === 'loading');
    const result = picture ? scoreHealth(picture, { asOf: DEMO_ASOF }) : null;
    const weakest = result ? [...result.indicators].sort((a, b) => (a.points ?? -1) - (b.points ?? -1) || b.weight - a.weight)[0] : null;
    return {
      id, name: m.memberId === viewerId ? `${person.name} (you)` : person.name, roleLabel: person.roleLabel, initial: person.initial, color: person.color,
      result, loading,
      summary: !person.hasAccounts
        ? `${person.name} has no accounts. They come along on huddles as “not paying”, so the split only counts people who pay.`
        : weakest && weakest.status !== 'green'
          ? `${weakest.label}: ${weakest.explanation}`
          : result
            ? 'Every indicator is healthy.'
            : '',
      facts: picture
        ? [
            { k: 'Paycheck', v: picture.paycheck ? `${money0(picture.paycheck.avgAmount)} · next ${dayDate(picture.paycheck.nextDate)}` : 'None detected' },
            { k: 'Checking', v: money(balanceOf(picture, 'Checking')) },
            { k: 'Savings', v: money(balanceOf(picture, 'Savings')) },
          ]
        : [{ k: 'Accounts', v: person.hasAccounts ? '…' : 'None' }],
    };
  });

  const ready = memberIds.map((id) => pictures[id]).flatMap((s) => (s?.status === 'ready' && s.picture ? [s.picture] : []));
  const income = ready.reduce((s, p) => s + monthlyPay(p), 0);
  const essential = ready.reduce((s, p) => s + p.obligations.filter((o) => o.essential).reduce((x, o) => x + monthly(o), 0), 0);
  const savings = ready.reduce((s, p) => s + balanceOf(p, 'Savings'), 0);
  const openHuddles = (huddlesState.status === 'ready' ? huddlesState.huddles : []).filter(
    (h) => h.phase !== 'locked' && h.phase !== 'cancelled' && h.participants.some((p) => memberIds.includes(p.memberId)),
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>{household.iAmOwner ? 'Your household' : `${household.owner.name}’s household`}</Eyebrow>
        <h1 className="m-0 text-[32px]">Household</h1>
        <p className="m-0 text-ink-2">Household members can see each other’s full picture. Friends never can.</p>
      </div>

      <FamilyCarousel slides={slides} />

      {household.iAmOwner && (
        <div className="flex flex-wrap items-start gap-5">
          <AddByUsername kind="household" title="Invite someone to your household" help="They accept on their own device." />
          {pendingInvites.length > 0 && (
            <Card label="Invites sent" className="flex min-w-0 flex-[999_1_420px] flex-col gap-1">
              <h2 className="m-0 mb-2 text-[22px]">Invites sent</h2>
              {pendingInvites.map((r) => (
                <PersonRow key={r.id} person={r.to} right={<Pill className="bg-warn-bg text-warn">Waiting</Pill>} />
              ))}
            </Card>
          )}
        </div>
      )}

      <Card label="Household totals" className="flex flex-wrap gap-6">
        <Total label="Household income" value={`${money0(income)}/mo`} />
        <Total label="Essential bills" value={`${money0(essential)}/mo`} />
        <Total label="Savings, all members" value={money0(savings)} />
        <div className="flex flex-[1_1_200px] flex-col gap-1">
          <Eyebrow>Open huddles</Eyebrow>
          {openHuddles.length === 0 ? (
            <span className="font-display text-[26px] font-semibold">0</span>
          ) : (
            openHuddles.map((h) => (
              <Link key={h.id} href={`/huddles/${h.id}`} className="font-display text-[22px] font-semibold no-underline">
                {h.name}
              </Link>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-[1_1_200px] flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-display text-[26px] font-semibold">{value}</span>
    </div>
  );
}
