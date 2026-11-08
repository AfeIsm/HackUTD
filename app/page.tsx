import Link from 'next/link';
import { btn } from '@/components/ui';

const PREVIEW_BARS = [
  { label: 'Bills covered', width: '100%', color: 'bg-good-ring' },
  { label: 'Safety cushion', width: '50%', color: 'bg-warn-ring' },
  { label: 'Savings protected', width: '100%', color: 'bg-good-ring' },
];

export default function LandingPage() {
  return (
    <div className="mx-auto box-border flex min-h-screen max-w-[1160px] flex-col px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="font-display text-2xl font-bold text-ink no-underline">
          Wallet Whisperer
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/dashboard" className="px-2 py-3 font-semibold text-ink no-underline hover:text-accent">
            Log in
          </Link>
          <Link href="/dashboard" className={btn}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-wrap items-center gap-14 pb-[72px] pt-12">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-6">
          <h1 className="m-0 text-[clamp(44px,6.5vw,76px)] leading-[1.02] tracking-[-0.02em]">Can we afford it?</h1>
          <p className="m-0 max-w-[500px] text-xl leading-normal text-ink-2">
            See your whole financial picture, get a health score that updates itself, and plan big purchases with family
            and friends without sharing your finances.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/dashboard" className={`${btn} min-h-12 px-6 text-base`}>
              Get started
            </Link>
          </div>
        </div>

        <div
          aria-label="Health score preview"
          className="box-border flex flex-[1_1_340px] flex-col gap-[18px] rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_50px_rgba(22,24,29,0.10)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-muted">Your health score</span>
            <span className="rounded-full bg-good-bg px-2.5 py-1 text-[13px] font-semibold text-good">Healthy</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[72px] font-bold leading-none">82</span>
            <span className="text-muted">/ 100</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {PREVIEW_BARS.map((b) => (
              <div key={b.label} className="flex flex-col gap-1">
                <span className="text-[13px]">{b.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-soft">
                  <div className={`h-2 ${b.color}`} style={{ width: b.width }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 rounded-[10px] bg-bg px-3.5 py-3 text-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F4FD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="3" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
            <span>Orlando trip · 3 of 4 committed</span>
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-line py-6 text-sm text-muted">
        <span>© 2026 Wallet Whisperer</span>
        <span>Your finances stay private. Always.</span>
      </footer>
    </div>
  );
}
