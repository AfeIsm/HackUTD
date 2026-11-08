// Centered card used by /login and /signup.

import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto box-border flex min-h-screen max-w-[1160px] flex-col px-6">
      <header className="py-5">
        <Link href="/" className="font-display text-2xl font-bold text-ink no-underline">
          Wallet Whisperer
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center pb-16 pt-8">
        <div className="box-border flex w-full max-w-[420px] flex-col gap-6 rounded-2xl border border-line bg-surface p-7 shadow-[0_20px_50px_rgba(22,24,29,0.08)]">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[32px] leading-tight">{title}</h1>
            <p className="m-0 text-ink-2">{subtitle}</p>
          </div>
          {children}
          <p className="m-0 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}
