'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useConnections, sendConnectionChange } from '@/lib/useConnections';
import { AddByUsername } from '@/components/AddByUsername';
import { PersonRow } from '@/components/PersonRow';
import { RequestCards } from '@/components/RequestCards';
import { Card, Pill } from '@/components/ui';
import { PageShell } from '@/components/wallet/PageShell';

export default function FriendsPage() {
  const conn = useConnections();
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function remove(userId: string) {
    if (removing) return;
    setRemoving(userId);
    setError(await sendConnectionChange(`/api/friends/${encodeURIComponent(userId)}`, 'DELETE', {}));
    setRemoving(null);
  }
  const data = conn.status === 'ready' ? conn.data : null;
  const friendIds = new Set(data?.friends.map((f) => f.userId));
  // Requests I sent that aren't friendships yet (pending or declined)
  const sent = (data?.sent ?? []).filter((r) => r.kind === 'friend' && r.status !== 'accepted' && !friendIds.has(r.to.userId));

  return (
    <PageShell id="friends" title="Friends" showDemoNotice={false}
      intro="Friends see your pledge amount only after everyone commits. Never your balances, bills or score.">
      <div className="grid gap-6">
      {data && <RequestCards requests={data.incoming} />}

      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <AddByUsername
          kind="friend"
          title="Add a friend by username"
          help="Type their exact username. They get the request on their own device and have to accept."
        />

        <Card label="Your friends" className="min-w-0">
          <h2 className="section-title font-display">Your friends</h2>
          {error && <p role="alert" className="m-0 text-sm text-bad">{error}</p>}
          {conn.status === 'loading' && <p className="m-0 text-muted">Loading…</p>}
          {conn.status === 'error' && <p className="m-0 text-bad">Couldn’t load your friends. Refresh to try again.</p>}
          {data && data.friends.length === 0 && sent.length === 0 && <p className="m-0 text-ink-2">No friends yet. Add someone by username.</p>}
          {data?.friends.map((f) => (
            <PersonRow key={f.userId} person={f} right={
              <div className="flex flex-wrap items-center gap-2">
                <Pill className="pill-healthy">Accepted</Pill>
                <button type="button" disabled={removing !== null || !f.userId} aria-label={`Remove ${f.name} as a friend`}
                  className="min-h-11 cursor-pointer rounded-[10px] px-3 text-sm font-semibold text-bad hover:bg-bad-bg disabled:cursor-wait disabled:opacity-50"
                  onClick={() => { if (f.userId) void remove(f.userId); }}>
                  {removing === f.userId ? 'Removing…' : 'Remove friend'}
                </button>
              </div>
            } />
          ))}
          {sent.map((r) => (
            <PersonRow
              key={r.id}
              person={r.to}
              right={
                <Pill className={r.status === 'pending' ? 'pill-watch' : 'pill-needsInput'}>
                  {r.status === 'pending' ? 'Request sent' : 'Declined'}
                </Pill>
              }
            />
          ))}
          <Link href="/huddles" className="mt-4 inline-block font-semibold hover:underline">Plan something together →</Link>
        </Card>
      </div>
      </div>
    </PageShell>
  );
}
