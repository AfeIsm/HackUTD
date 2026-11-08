// Small shared UI pieces: cards, labels, status pills, button styles.

import type { ReactNode } from 'react';
import type { Status } from '@/lib/types';

export const TONE: Record<Status, { label: string; pill: string; ring: string; bar: string; tint: string }> = {
  green: { label: 'Healthy', pill: 'bg-good-bg text-good', ring: '#1E8E4E', bar: 'bg-good-ring', tint: 'bg-[#F1FAF4]' },
  yellow: { label: 'Watch', pill: 'bg-warn-bg text-warn', ring: '#D48A0C', bar: 'bg-warn-ring', tint: 'bg-[#FEF8EC]' },
  red: { label: 'At risk', pill: 'bg-bad-bg text-bad', ring: '#D2382E', bar: 'bg-bad-ring', tint: 'bg-[#FDF2F1]' },
};

export const btn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-[18px] text-[15px] font-semibold text-white no-underline hover:bg-accent-dark disabled:opacity-50 cursor-pointer';
export const btn2 =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-line-2 bg-white px-[18px] text-[15px] font-semibold text-ink no-underline hover:bg-hover cursor-pointer';
export const input =
  'min-h-11 w-full rounded-[10px] border border-line-2 bg-white px-3 text-base text-ink box-border';

export function Card({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`box-border rounded-[14px] border border-line bg-surface p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted ${className}`}>{children}</p>;
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status, className = '' }: { status: Status; className?: string }) {
  return <Pill className={`${TONE[status].pill} ${className}`}>{TONE[status].label}</Pill>;
}

export function Avatar({ initial, color, size = 40 }: { initial: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
