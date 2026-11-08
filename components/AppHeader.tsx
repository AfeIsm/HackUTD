'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { PEOPLE } from '@/lib/people';
import { logout, useMe } from '@/lib/useMe';
import { useHuddles } from '@/lib/useHuddles';
import { Avatar } from './ui';

const NAV = [
  { href: '/dashboard', label: 'My Money' },
  { href: '/buy', label: 'Can I buy?' },
  { href: '/huddles', label: 'Huddles' },
  { href: '/household', label: 'Household' },
  { href: '/friends', label: 'Friends' },
];

// How many of my huddles have a commitment that no longer passes its health check.
function useHuddleWarnings(): number {
  const state = useHuddles();
  return state.status === 'ready' ? state.huddles.filter((h) => h.atRiskCount > 0).length : 0;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  const warnings = useHuddleWarnings();
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
            {item.href === '/huddles' && warnings > 0 && (
              <span
                role="img"
                aria-label={`${warnings} huddle${warnings === 1 ? '' : 's'} need attention`}
                title="A huddle commitment is no longer affordable"
                className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[12px] font-bold text-white"
              >
                !
              </span>
            )}
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

// Logged-in user: name, @username, log out. Who you are comes from the session, not a picker.
function UserMenu() {
  const me = useMe();
  if (me.status !== 'in') return <span className="min-h-11" aria-hidden="true" />;
  const { user } = me;
  const color = PEOPLE.find((p) => p.id === user.memberId)?.color ?? '#1F4FD8';
  return (
    <div className="flex items-center gap-3">
      <Avatar initial={(user.name[0] ?? '?').toUpperCase()} color={color} size={32} />
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold text-ink">{user.name}</span>
        <span className="text-[13px] text-muted">@{user.username}</span>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="min-h-11 rounded-[10px] px-3 text-[14px] font-semibold text-ink-2 hover:bg-soft hover:text-ink cursor-pointer"
      >
        Log out
      </button>
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-6">
        <Link href="/dashboard" className="font-display text-[22px] font-bold text-ink no-underline">
          Wallet Whisperer
        </Link>
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNav />
        </Suspense>
      </div>
      <UserMenu />
    </header>
  );
}
