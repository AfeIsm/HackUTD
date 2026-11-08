'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { PEOPLE, getPerson } from '@/lib/people';
import { useViewer } from '@/lib/viewer';
import { Avatar } from './ui';

const NAV = [
  { href: '/dashboard', label: 'My Money' },
  { href: '/buy', label: 'Can I buy?' },
  { href: '/huddles', label: 'Huddles' },
  { href: '/household', label: 'Household' },
  { href: '/friends', label: 'Friends' },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="App" className="flex flex-wrap gap-1">
      {NAV.map((item) => {
        const active = !!pathname && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-[15px] font-medium no-underline ${
              active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Reads the URL, so Next 16 needs it inside <Suspense> (fallback: same links, none highlighted)
function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function AppHeader() {
  const { viewerId, setViewerId } = useViewer();
  const me = getPerson(viewerId);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-6">
        <Link href="/" className="font-display text-[22px] font-bold text-ink no-underline">
          Wallet Whisperer
        </Link>
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNav />
        </Suspense>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-muted">
        <Avatar initial={me.initial} color={me.color} size={32} />
        <span className="sr-only">Signed in as</span>
        <select
          value={viewerId}
          onChange={(e) => setViewerId(e.target.value)}
          className="min-h-11 rounded-[10px] border border-line-2 bg-white px-3 text-[15px] font-medium text-ink"
        >
          {PEOPLE.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
