'use client';

import { useId, useState, type ReactNode } from 'react';
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
  facts: { k: string; v: string }[];
  details?: ReactNode;
}

/** The wallet's household overview only receives consent-filtered member data. */
export function FamilyCarousel({ slides, unavailable = false }: { slides: FamilySlide[]; unavailable?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detailId = useId();
  if (!slides.length) return <section className="household-overview"><p className="text-muted" aria-live="polite">
    {unavailable ? 'Shared household details are unavailable. Refresh sharing to try again.' : 'Loading household members…'}
  </p></section>;
  const selected = Math.max(0, slides.findIndex((slide) => slide.id === selectedId));
  const current = slides[selected];
  const choose = (index: number) => {
    setSelectedId(slides[(index + slides.length) % slides.length].id);
    setExpandedId(null);
  };

  return (
    <section className="household-overview min-w-0" aria-label="Household overview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Household at a glance</p>
          <p className="text-muted-foreground" aria-live="polite">{current.name} · {selected + 1} of {slides.length}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="icon-btn" aria-label="Previous member" disabled={slides.length === 1} onClick={() => choose(selected - 1)}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next member" disabled={slides.length === 1} onClick={() => choose(selected + 1)}>›</button>
        </div>
      </div>
      <div className="member-card mt-5">
        <div className="flex items-center gap-3">
          <Avatar initial={current.initial} color={current.color} size={48} />
          <div className="min-w-0">
            <h2 className="font-display text-2xl break-words">{current.name}</h2>
            <p className="text-sm text-muted-foreground">{current.roleLabel}</p>
          </div>
        </div>
        {current.result ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={`font-display ${current.result.score === null ? 'text-2xl' : 'text-5xl'}`}>{current.result.score ?? 'Needs input'}</span>
            <StatusPill status={current.result.overall} />
          </div>
        ) : <p className="mt-4 text-sm text-muted-foreground">{current.loading ? 'Loading health score…' : 'Health score private'}</p>}
        <p className="mt-4 text-sm text-muted-foreground">{current.summary}</p>
        {current.facts.length > 0 && <dl className="mt-4 grid gap-2">
          {current.facts.map((fact) => <div key={fact.k} className="flex flex-wrap justify-between gap-2 text-sm">
            <dt>{fact.k}</dt><dd className="font-semibold tabular-nums">{fact.v}</dd>
          </div>)}
        </dl>}
        {current.details && <button type="button" className="mt-5 min-h-11 text-sm font-semibold underline underline-offset-4"
          aria-expanded={expandedId === current.id} aria-controls={detailId}
          onClick={() => setExpandedId(expandedId === current.id ? null : current.id)}>
          {expandedId === current.id ? 'Hide details' : 'View all shared details'}
        </button>}
        <div id={detailId} hidden={expandedId !== current.id} className="mt-4 min-w-0">
          {expandedId === current.id ? current.details : null}
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Choose a family member">
        {slides.map((slide, index) => <button key={slide.id} type="button"
          className={`member-tab ${index === selected ? 'is-active' : ''}`} aria-pressed={index === selected} onClick={() => choose(index)}>
          <Avatar initial={slide.initial} color={slide.color} size={32} />
          <span className="min-w-0 flex-1 break-words text-left text-sm font-semibold">{slide.name}</span>
          <span className="text-sm text-muted-foreground">{slide.result ? (slide.result.score ?? 'Needs input') : '—'}</span>
        </button>)}
      </div>
    </section>
  );
}
