'use client';

// Coverflow carousel: the selected person in front, neighbors smaller and darkened behind.
// Drag/swipe, arrow buttons, clicking a back card, or the name buttons all move it. It loops.

import { useId, useRef, useState, type ReactNode } from 'react';
import type { HealthResult } from '@/lib/types';
import { Avatar, Eyebrow, StatusPill, TONE } from './ui';

export interface FamilySlide {
  id: string;
  name: string;
  roleLabel: string;
  initial: string;
  color: string;
  result: Pick<HealthResult, 'score' | 'overall'> | null;
  loading: boolean;
  summary: string;
  facts: { k: string; v: string }[];
  details?: ReactNode;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const CARD_WIDTH = 0.7; // card = 70% of the carousel
const SPACING = 0.68; // neighbors sit 68% of a card width away

export function FamilyCarousel({ slides }: { slides: FamilySlide[] }) {
  const n = slides.length;
  const [idx, setIdx] = useState(0); // counts up/down forever; front card = idx mod n
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState(380); // px between card spots, measured when a drag starts
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detailId = useId();
  const drag = useRef({ startX: 0, moved: false, captured: false, pointerId: 0 });

  if (n === 0) return null;
  const current = mod(idx, n);
  const pos = idx - (dragging ? dx / step : 0);
  const go = (next: number) => { setExpandedId(null); setIdx(next); };
  const goTo = (k: number) => {
    let d = mod(k - idx, n);
    if (d >= n / 2) d -= n;
    go(idx + d);
  };

  return (
    <section aria-roledescription="carousel" aria-label="Household overview" className="flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Household at a glance</Eyebrow>
          <span className="text-sm text-muted">{slides[current].name} · {current + 1} of {n}</span>
        </div>
        <div className="flex gap-2">
          <ArrowButton label="Previous family member" onClick={() => go(idx - 1)} d="M15 18l-6-6 6-6" />
          <ArrowButton label="Next family member" onClick={() => go(idx + 1)} d="M9 18l6-6-6-6" />
        </div>
      </div>

      <div
        className="relative -mx-6 h-[480px] touch-pan-y select-none overflow-hidden rounded-2xl bg-[#EAEAE4]"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          if (e.button > 0) return;
          if ((e.target as HTMLElement).closest('button, a, input')) return;
          drag.current = { startX: e.clientX, moved: false, captured: false, pointerId: e.pointerId };
          setStep((e.currentTarget.offsetWidth || 800) * CARD_WIDTH * SPACING);
          setDragging(true);
          setDx(0);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const d = e.clientX - drag.current.startX;
          if (!drag.current.captured && Math.abs(d) > 6) {
            e.currentTarget.setPointerCapture(drag.current.pointerId);
            drag.current.captured = true;
            drag.current.moved = true;
          }
          const max = step * 1.2;
          setDx(Math.max(-max, Math.min(max, d)));
        }}
        onPointerUp={() => {
          if (!dragging) return;
          const th = step * 0.2;
          setDragging(false);
          setDx(0);
          go(idx + (dx < -th ? 1 : dx > th ? -1 : 0));
        }}
        onPointerCancel={() => {
          setDragging(false);
          setDx(0);
        }}
      >
        <div aria-live="polite" className="absolute inset-0">
          {slides.map((s, k) => {
            // signed distance from the front, wrapped into [-n/2, n/2) so the ring loops
            const lap = Math.ceil((pos - k - n / 2) / n);
            const p = k - pos + n * lap;
            const a = Math.abs(p);
            const isFront = k === current;
            const easing = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
            return (
              <div
                key={`${s.id}:${lap}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${s.name}, ${k + 1} of ${n}`}
                aria-hidden={!isFront}
                onClick={() => {
                  if (!drag.current.moved && !isFront) goTo(k);
                }}
                className="absolute bottom-6 top-6 box-border flex flex-col gap-3 overflow-hidden rounded-[18px] border border-line bg-white p-4 sm:p-6 shadow-[0_16px_40px_rgba(22,24,29,0.16)]"
                style={{
                  left: `${(1 - CARD_WIDTH) * 50}%`,
                  width: `${CARD_WIDTH * 100}%`,
                  transform: `translateX(${(p * SPACING * 100).toFixed(2)}%) scale(${(1 - 0.16 * Math.min(a, 1.5)).toFixed(3)})`,
                  opacity: Math.max(0, Math.min(1, 2 - a)),
                  zIndex: 100 - Math.round(a * 10),
                  transition: dragging ? 'none' : `transform 420ms ${easing}, opacity 420ms ease`,
                  animation: 'ww-fade-in 420ms ease',
                  cursor: isFront ? 'inherit' : 'pointer',
                }}
              >
                <SlideBody s={s} />
                {s.details && <button type="button" tabIndex={isFront ? 0 : -1}
                  aria-expanded={isFront && expandedId === s.id} aria-controls={isFront ? detailId : undefined}
                  aria-label={`${expandedId === s.id ? 'Hide' : 'Expand'} ${s.name} details`}
                  className="mt-auto flex min-h-11 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-soft"
                  onClick={(event) => { event.stopPropagation(); if (isFront) setExpandedId(expandedId === s.id ? null : s.id); }}>
                  {expandedId === s.id ? 'Hide details' : 'View all shared details'}
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`shrink-0 transition-transform ${expandedId === s.id ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[18px] bg-ink"
                  style={{ opacity: Math.min(a, 1) * 0.5, transition: dragging ? 'none' : 'opacity 420ms ease' }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div id={detailId} role="region" aria-label={`${slides[current].name} shared details`}
        hidden={expandedId !== slides[current].id} className="min-w-0">
        {expandedId === slides[current].id ? slides[current].details : null}
      </div>
      <p className="m-0 text-center text-[13px] text-muted">Drag or swipe the card, or click a card in the back to bring it forward</p>

      <div role="tablist" aria-label="Choose a family member" className="flex flex-wrap gap-2">
        {slides.map((s, k) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={k === current}
            onClick={() => goTo(k)}
            className={`flex min-h-[52px] flex-[1_1_160px] cursor-pointer items-center gap-2.5 rounded-xl border-2 bg-white px-3 py-2 text-left text-sm font-medium text-ink ${
              k === current ? 'border-ink' : 'border-line'
            }`}
          >
            <Avatar initial={s.initial} color={s.color} size={32} />
            <span className="flex-1 font-semibold">{s.name}</span>
            <span className={`font-display font-bold ${s.result ? TONE[s.result.overall].pill.split(' ')[1] : 'text-muted'}`}>
              {s.result ? (s.result.score ?? '—') : '—'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SlideBody({ s }: { s: FamilySlide }) {
  const tint = s.result ? TONE[s.result.overall].tint : 'bg-bg';
  return (
    <>
      <div className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[14px] p-3 sm:p-4 ${tint}`}>
        <div className="flex items-center gap-3.5">
          <Avatar initial={s.initial} color={s.color} size={40} />
          <div className="flex flex-col">
            <h2 className="m-0 text-xl sm:text-[24px]">{s.name}</h2>
            <span className="text-sm text-ink-2">{s.roleLabel}</span>
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[42px] font-bold leading-none">{s.loading ? '…' : s.result ? (s.result.score ?? '—') : '—'}</span>
          {s.result && <StatusPill status={s.result.overall} />}
          {!s.result && <span className="text-xs text-muted">Health score private</span>}
        </div>
        <p className="m-0 text-sm leading-normal text-ink-2">{s.summary}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-ink-2">
          {s.facts.slice(0, 3).map((f) => (
            <li key={f.k} className="flex justify-between gap-2">
              <span>{f.k}</span>
              <strong className="text-ink">{f.v}</strong>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ArrowButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line-2 bg-white text-ink hover:bg-hover"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}
