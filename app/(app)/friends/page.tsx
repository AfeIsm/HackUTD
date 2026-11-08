'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PEOPLE, getPerson } from '@/lib/people';
import { friendsOf, respondToInvite, sendFriendRequest, useHuddleStore } from '@/lib/huddles';
import { useViewer } from '@/lib/viewer';
import { money0, shortDate } from '@/lib/format';
import { Avatar, Card, Eyebrow, Pill, btn, btn2, input } from '@/components/ui';

const digits = (s: string) => s.replace(/\D/g, '');

export default function FriendsPage() {
  const { viewerId } = useViewer();
  const me = getPerson(viewerId);
  const store = useHuddleStore();
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const incoming = store.invites.filter((i) => i.toId === me.id && i.status === 'pending');
  const sent = store.invites.filter((i) => i.fromId === me.id);
  const friends = friendsOf(store, me.id);

  const rows = [
    ...friends.map((id) => ({ id, status: 'Friends', className: 'bg-good-bg text-good' })),
    ...sent
      .filter((i) => !friends.includes(i.toId))
      .map((i) => ({
        id: i.toId,
        status: i.status === 'pending' ? 'Invite sent' : i.status === 'declined' ? 'Declined' : 'Friends',
        className: i.status === 'pending' ? 'bg-warn-bg text-warn' : 'bg-hover text-muted',
      })),
  ].filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);

  const send = () => {
    const match = PEOPLE.find((p) => p.phone && digits(p.phone) === digits(phone));
    if (!match) return setNotice({ ok: false, text: 'No Wallet Whisperer account uses that number yet.' });
    if (match.id === me.id) return setNotice({ ok: false, text: 'That’s your own number.' });
    if (rows.some((r) => r.id === match.id)) return setNotice({ ok: false, text: `You’ve already invited ${match.name}.` });
    sendFriendRequest(me.id, match.id);
    setPhone('');
    setNotice({ ok: true, text: `Invite sent to ${match.name}. They need to accept.` });
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>People outside your household</Eyebrow>
        <h1 className="m-0 text-[32px]">Friends</h1>
        <p className="m-0 text-ink-2">Friends see your pledge amount only after everyone commits. Never your balances, bills or score.</p>
      </div>

      {incoming.map((inv) => {
        const h = inv.huddleId ? store.huddles.find((x) => x.id === inv.huddleId) : null;
        const from = getPerson(inv.fromId);
        return (
          <section key={inv.id} aria-label="Invite" className="flex flex-col gap-4 rounded-[14px] border border-[#BFD0F5] bg-accent-bg p-6">
            <Eyebrow className="text-[#1A3E9E]">New invite</Eyebrow>
            <h2 className="m-0 text-2xl">
              {h ? `${from.name} invited you to the “${h.name}” huddle` : `${from.name} wants to be friends`}
            </h2>
            {h && (
              <>
                <p className="m-0 text-ink-2">
                  {money0(h.totalCost)} total · pay by {shortDate(h.targetDate)} · {h.participants.length} people
                </p>
                <ul className="m-0 flex flex-col gap-1.5 pl-5 leading-normal text-ink-2">
                  <li>You choose your own amount and which account it comes from.</li>
                  <li>Wallet Whisperer checks it against your own finances, privately.</li>
                  <li>Nobody sees amounts until everyone has committed.</li>
                </ul>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => respondToInvite(inv.id, true)}>
                {h ? 'Accept and join' : 'Accept'}
              </button>
              <button type="button" className={btn2} onClick={() => respondToInvite(inv.id, false)}>Decline</button>
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-start gap-5">
        <form
          aria-label="Add a friend"
          className="box-border flex flex-[1_1_360px] flex-col gap-4 rounded-[14px] border border-line bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <h2 className="m-0 text-[22px]">Add a friend by phone</h2>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Phone number
            <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0142" />
          </label>
          <button type="submit" className={btn} disabled={digits(phone).length < 7}>Send invite</button>
          {notice && (
            <p role="status" className={`m-0 rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>
              {notice.text}
            </p>
          )}
          <p className="m-0 text-[13px] text-muted">They get an invite in Wallet Whisperer and have to accept before they join anything.</p>
        </form>

        <Card label="Your friends" className="flex min-w-0 flex-[999_1_480px] flex-col gap-1">
          <h2 className="m-0 mb-2 text-[22px]">Your friends</h2>
          {rows.length === 0 && <p className="m-0 text-ink-2">No friends yet.</p>}
          {rows.map((r) => {
            const p = getPerson(r.id);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-[#EFEFEA] py-3.5">
                <Avatar initial={p.initial} color={p.color} />
                <div className="flex min-w-0 flex-[1_1_160px] flex-col">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-[13px] text-muted">{p.phone ?? p.roleLabel}</span>
                </div>
                <Pill className={r.className}>{r.status}</Pill>
              </div>
            );
          })}
          <Link href="/huddles" className="mt-2 text-sm font-semibold">Plan something together →</Link>
        </Card>
      </div>
    </>
  );
}
