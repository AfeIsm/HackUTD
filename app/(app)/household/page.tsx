'use client';

import Link from 'next/link';
import type { FinancialPicture } from '@/lib/types';
import { scoreHealth, monthly } from '@/lib/engine/health';
import { dayDate, money, money0 } from '@/lib/format';
import { DEMO_ASOF, HOUSEHOLD_IDS, getPerson } from '@/lib/people';
import { useHuddleStore } from '@/lib/huddles';
import { usePictures } from '@/lib/usePicture';
import { FamilyCarousel, type FamilySlide } from '@/components/FamilyCarousel';
import { Card, Eyebrow } from '@/components/ui';

const PER_MONTH: Record<number, number> = { 7: 52 / 12, 14: 26 / 12, 15: 2, 30: 1 };
const monthlyPay = (p: FinancialPicture) => (p.paycheck ? Math.round(p.paycheck.avgAmount * (PER_MONTH[p.paycheck.cadenceDays] ?? 1)) : 0);
const balanceOf = (p: FinancialPicture, type: 'Checking' | 'Savings') =>
  p.accounts.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0);

export default function HouseholdPage() {
  const pictures = usePictures(HOUSEHOLD_IDS.filter((id) => getPerson(id).hasAccounts));
  const store = useHuddleStore();

  const slides: FamilySlide[] = HOUSEHOLD_IDS.map((id) => {
    const person = getPerson(id);
    const state = pictures[id];
    const picture = state?.status === 'ready' ? state.picture : null;
    const loading = person.hasAccounts && (!state || state.status === 'loading');
    const result = picture ? scoreHealth(picture, { asOf: DEMO_ASOF }) : null;
    const weakest = result ? [...result.indicators].sort((a, b) => (a.points ?? -1) - (b.points ?? -1) || b.weight - a.weight)[0] : null;
    return {
      id, name: id === 'alex' ? 'Alex (you)' : person.name, roleLabel: person.roleLabel, initial: person.initial, color: person.color,
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

  const ready = HOUSEHOLD_IDS.map((id) => pictures[id]).flatMap((s) => (s?.status === 'ready' && s.picture ? [s.picture] : []));
  const income = ready.reduce((s, p) => s + monthlyPay(p), 0);
  const essential = ready.reduce((s, p) => s + p.obligations.filter((o) => o.essential).reduce((x, o) => x + monthly(o), 0), 0);
  const savings = ready.reduce((s, p) => s + balanceOf(p, 'Savings'), 0);
  const openHuddles = store.huddles.filter(
    (h) => h.phase !== 'locked' && h.phase !== 'cancelled' && h.participants.some((p) => HOUSEHOLD_IDS.includes(p.memberId)),
  );

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>The Rivera household</Eyebrow>
        <h1 className="m-0 text-[32px]">Household</h1>
        <p className="m-0 text-ink-2">As the household owner you can see everyone’s full picture. Friends never can.</p>
      </div>

      <FamilyCarousel slides={slides} />

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
