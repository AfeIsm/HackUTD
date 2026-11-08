'use client';

// Coverflow carousel: the selected person in front, neighbors smaller and darkened behind, so the
// cards read as a ring. Drag/swipe, the arrows, a back card or the name buttons all move it.
// It only ever receives consent-filtered member data.

import { useId, useRef, useState, type ReactNode } from 'react';
import type { HealthResult } from '@/lib/types';
import { Avatar, StatusPill } from './ui';

export interface FamilySlide {
  id: string;
  name: string;
  roleLabel: string;
  initial: string;
  color: string;
  result: Pick<HealthResult, 'score' | 'overall'> | null;
  loading: boolean;
  summary: string;
  facts: { k: string; v: ReactNode }[];
  details?: ReactNode;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const CARD_WIDTH = 0.74; // card = 74% of the stage
const SPACING = 0.62; // neighbors sit 62% of a card width away
const EASING = 'cubic-bezier(0.22, 0.8, 0.24, 1)';

export function FamilyCarousel({ slides, unavailable = false }: { slides: FamilySlide[]; unavailable?: boolean }) {
  const n = slides.length;
  const [idx, setIdx] = useState(0); // counts up/down forever; front card = idx mod n
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState(240); // px between card spots, measured when a drag starts
  const dialog = useRef<HTMLDialogElement>(null);
  const detailId = useId();
  const drag = useRef({ startX: 0, moved: false, captured: false, pointerId: 0 });

  if (!n) return <section className="household-overview"><p className="text-muted" aria-live="polite">
    {unavailable ? 'Shared household details are unavailable. Refresh sharing to try again.' : 'Loading household members…'}
  </p></section>;

  const selected = mod(idx, n);
  const current = slides[selected];
  const pos = idx - (dragging ? dx / step : 0);
  const go = (next: number) => { if (n > 1) setIdx(next); dialog.current?.close(); };
  const goTo = (k: number) => {
    let d = mod(k - idx, n);
    if (d >= n / 2) d -= n; // the short way round the ring
    go(idx + d);
  };

  return (
    <section className="household-overview min-w-0" aria-roledescription="carousel" aria-label="Household overview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Household at a glance</p>
          <p className="text-muted-foreground" aria-live="polite">{current.name} · {selected + 1} of {n}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="icon-btn" aria-label="Previous member" disabled={n === 1} onClick={() => go(idx - 1)}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next member" disabled={n === 1} onClick={() => go(idx + 1)}>›</button>
        </div>
      </div>

      <div
        className="relative mt-5 h-[440px] touch-pan-y select-none overflow-hidden rounded-2xl bg-soft"
        style={{ cursor: n === 1 ? undefined : dragging ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          drag.current.moved = false;
          if (e.button > 0 || n === 1 || (e.target as HTMLElement).closest('button, a, input')) return;
          drag.current = { startX: e.clientX, moved: false, captured: false, pointerId: e.pointerId };
          setStep((e.currentTarget.offsetWidth || 400) * CARD_WIDTH * SPACING);
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
          const threshold = step * 0.2;
          setDragging(false);
          setDx(0);
          if (Math.abs(dx) > threshold) go(idx + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => { setDragging(false); setDx(0); }}
      >
        {slides.map((s, k) => {
          // signed distance from the front, wrapped into [-n/2, n/2) so the ring loops
          const lap = Math.ceil((pos - k - n / 2) / n);
          const p = k - pos + n * lap;
          const a = Math.abs(p);
          const isFront = k === selected;
          return (
            <div
              key={`${s.id}:${lap}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${s.name}, ${k + 1} of ${n}`}
              aria-hidden={!isFront}
              onClick={() => { if (!drag.current.moved && !isFront) goTo(k); }}
              className="absolute bottom-5 top-5 box-border flex flex-col gap-3 overflow-hidden rounded-[14px] border border-line bg-[var(--paper)] p-4 shadow-[0_16px_40px_rgba(22,24,29,0.18)]"
              style={{
                left: `${(1 - CARD_WIDTH) * 50}%`,
                width: `${CARD_WIDTH * 100}%`,
                transform: `translateX(${(p * SPACING * 100).toFixed(2)}%) scale(${(1 - 0.18 * Math.min(a, 1.5)).toFixed(3)})`,
                opacity: Math.max(0, Math.min(1, 2 - a)),
                zIndex: 100 - Math.round(a * 10),
                transition: dragging ? 'none' : `transform 420ms ${EASING}, opacity 420ms ease`,
                animation: 'ww-fade-in 420ms ease',
                cursor: isFront ? 'inherit' : 'pointer',
              }}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div className="flex items-center gap-3">
                  <Avatar initial={s.initial} color={s.color} size={44} />
                  <div className="min-w-0">
                    <h2 className="font-display text-xl break-words">{s.name}</h2>
                    <p className="text-sm text-muted-foreground">{s.roleLabel}</p>
                  </div>
                </div>
                {s.result ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`font-display ${s.result.score === null ? 'text-2xl' : 'text-5xl'}`}>{s.result.score ?? 'Needs input'}</span>
                    <StatusPill status={s.result.overall} />
                  </div>
                ) : <p className="mt-3 text-sm text-muted-foreground">{s.loading ? 'Loading health score…' : 'Health score private'}</p>}
                <p className="mt-3 text-sm text-muted-foreground">{s.summary}</p>
                {s.facts.length > 0 && <dl className="mt-3 grid gap-2">
                  {s.facts.map((fact) => <div key={fact.k} className="flex flex-wrap justify-between gap-x-2 text-sm">
                    <dt>{fact.k}</dt><dd className="font-semibold tabular-nums">{fact.v}</dd>
                  </div>)}
                </dl>}
              </div>
              {s.details && <button type="button" tabIndex={isFront ? 0 : -1}
                className="flex min-h-11 w-full shrink-0 items-center justify-between gap-3 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-soft"
                aria-haspopup="dialog" aria-controls={isFront ? detailId : undefined}
                onClick={() => { if (isFront) dialog.current?.showModal(); }}>
                View shared details <span aria-hidden="true">↗</span>
              </button>}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[14px] bg-ink"
                style={{ opacity: Math.min(a, 1) * 0.45, transition: dragging ? 'none' : 'opacity 420ms ease' }}
              />
            </div>
          );
        })}
      </div>
      {n > 1 && <p className="mt-2 text-center text-[13px] text-muted">Drag or swipe, or click a card in the back to bring it forward</p>}

      <dialog ref={dialog} id={detailId} aria-label={`${current.name} shared details`}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-[540px] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        onClick={(event) => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current.close(); } }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <span className="font-semibold">Shared details</span>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-soft" aria-label="Close shared details" onClick={() => dialog.current?.close()}>×</button>
        </div>
        {current.details}
      </dialog>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Choose a family member">
        {slides.map((slide, index) => <button key={slide.id} type="button"
          className={`member-tab ${index === selected ? 'is-active' : ''}`} aria-pressed={index === selected} onClick={() => goTo(index)}>
          <Avatar initial={slide.initial} color={slide.color} size={32} />
          <span className="min-w-0 flex-1 break-words text-left text-sm font-semibold">{slide.name}</span>
          <span className="text-sm text-muted-foreground">{slide.result ? (slide.result.score ?? 'Needs input') : '—'}</span>
        </button>)}
      </div>
    </section>
  );
}
