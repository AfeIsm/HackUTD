'use client';

import Link from 'next/link';
import { useConnections } from '@/lib/useConnections';
import { AddByUsername } from '@/components/AddByUsername';
import { PersonRow } from '@/components/PersonRow';
import { RequestCards } from '@/components/RequestCards';
import { Card, Eyebrow, Pill } from '@/components/ui';

export default function FriendsPage() {
  const conn = useConnections();
  const data = conn.status === 'ready' ? conn.data : null;
  const friendIds = new Set(data?.friends.map((f) => f.userId));
  // Requests I sent that aren't friendships yet (pending or declined)
  const sent = (data?.sent ?? []).filter((r) => r.kind === 'friend' && r.status !== 'accepted' && !friendIds.has(r.to.userId));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>People outside your household</Eyebrow>
        <h1 className="m-0 text-[32px]">Friends</h1>
        <p className="m-0 text-ink-2">Friends see your pledge amount only after everyone commits. Never your balances, bills or score.</p>
      </div>

      {data && <RequestCards requests={data.incoming} />}

      <div className="flex flex-wrap items-start gap-5">
        <AddByUsername
          kind="friend"
          title="Add a friend by username"
          help="Type their exact username. They get the request on their own device and have to accept."
        />

        <Card label="Your friends" className="flex min-w-0 flex-[999_1_480px] flex-col gap-1">
          <h2 className="m-0 mb-2 text-[22px]">Your friends</h2>
          {conn.status === 'loading' && <p className="m-0 text-muted">Loading…</p>}
          {conn.status === 'error' && <p className="m-0 text-bad">Couldn’t load your friends. Refresh to try again.</p>}
          {data && data.friends.length === 0 && sent.length === 0 && <p className="m-0 text-ink-2">No friends yet. Add someone by username.</p>}
          {data?.friends.map((f) => (
            <PersonRow key={f.userId} person={f} right={<Pill className="bg-good-bg text-good">Friends</Pill>} />
          ))}
          {sent.map((r) => (
            <PersonRow
              key={r.id}
              person={r.to}
              right={
                <Pill className={r.status === 'pending' ? 'bg-warn-bg text-warn' : 'bg-hover text-muted'}>
                  {r.status === 'pending' ? 'Request sent' : 'Declined'}
                </Pill>
              }
            />
          ))}
          <Link href="/huddles" className="mt-2 text-sm font-semibold">Plan something together →</Link>
        </Card>
      </div>
    </>
  );
}
