'use client';

// Projected balance as a step line: a balance holds until the day it changes.
// Hover, tap or use the day slider; the table underneath has the same numbers.

import { useEffect, useId, useRef, useState } from 'react';
import type { ForecastPoint } from '@/lib/types';
import { money, shortDate } from '@/lib/format';
import './ForecastChart.css';

const H = 292;
const M = { top: 24, right: 24, bottom: 36, left: 64 };
const BUFFER = 20_000; // the $200 line the health score uses

function niceStep(spanCents: number): number {
  const rough = spanCents / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const n = rough / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function axisLabel(cents: number, compact: boolean): string {
  const dollars = Math.abs(cents) / 100;
  const text = compact ? `$${dollars / 1000}K` : `$${dollars.toLocaleString('en-US')}`;
  return cents < 0 ? `−${text}` : text;
}

const signed = (cents: number) => `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`;
const TEXT = { fontSize: 12, fill: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' } as const;
const HALO = { paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 4, strokeLinejoin: 'round' } as const;

export function ForecastChart({ points, accountName = 'checking', showBuffer = true }: { points: ForecastPoint[]; accountName?: string; showBuffer?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const watch = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    watch.observe(box.current);
    return () => watch.disconnect();
  }, []);

  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const lowIndex = values.indexOf(Math.min(...values));
  const low = points[lowIndex];
  const end = points[points.length - 1];
  const selectedIndex = points.findIndex((p) => p.date === selectedDate);
  const selected = selectedIndex < 0 ? lowIndex : selectedIndex;
  const shown = hover !== null && points[hover] ? hover : selected;
  const active = points[shown];
  const change = shown === 0 ? null : active.balance - points[shown - 1].balance;
  const lowColor = low.balance < 0 ? 'var(--risk)' : showBuffer && low.balance < BUFFER ? 'var(--watch)' : 'var(--good)';
  const highlights = [
    { name: 'Starting balance', index: 0, color: 'var(--pnc-blue)' },
    { name: 'Lowest balance', index: lowIndex, color: lowColor },
    { name: 'Ending balance', index: points.length - 1, color: 'var(--pnc-blue)' },
  ];
  const changes = points.flatMap((p, i) => {
    const change = i === 0 ? null : p.balance - points[i - 1].balance;
    return i === 0 || change !== 0 ? [{ ...p, change }] : [];
  });
  const label = `Projected balance for ${accountName} over ${points.length - 1} days. Lowest ${money(low.balance)} on ${shortDate(low.date)}.${showBuffer ? ' The dashed line marks the $200 buffer.' : ''}`;

  const summary = <>
    <div className="forecast-highlights">
      {highlights.map((h) => <button key={h.name} type="button"
        className={`forecast-highlight ${selected === h.index ? 'forecast-selected' : ''}`}
        aria-pressed={selected === h.index}
        onClick={() => { setSelectedDate(points[h.index].date); setHover(null); }}>
        <span className="forecast-stat-label">{h.name}</span>{' '}
        <strong className="forecast-amount" style={{ color: h.color }}>{money(points[h.index].balance)}</strong>{' '}
        <span className="forecast-stat-date">{shortDate(points[h.index].date)}</span>
      </button>)}
    </div>
    <div className="forecast-legend">
      <span className="forecast-outlook" style={{ color: lowColor }}>
        <span aria-hidden="true">{low.balance < 0 || (showBuffer && low.balance < BUFFER) ? '!' : '✓'}</span>
        {low.balance < 0 ? 'Balance goes below $0' : !showBuffer ? 'Balance stays at or above $0' : low.balance < BUFFER ? 'Dips below your $200 buffer' : 'Keeps at least a $200 buffer'}
      </span>
      {showBuffer && <>{' '}<span className="forecast-legend-item"><span className="forecast-buffer-key" aria-hidden="true" />$200 buffer</span></>}
    </div>
  </>;
  const table = (
    <details className="forecast-table-details">
      <summary>See every balance change</summary>
      <table className="mt-2 w-full border-collapse tabular-nums">
        <caption className="sr-only">Projected balance changes from {shortDate(points[0].date)} to {shortDate(end.date)}</caption>
        <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Change</th><th className="py-1 text-right font-medium">Balance</th></tr></thead>
        <tbody>{changes.map((c) => <tr key={c.date} className="border-t border-line">
          <td className="py-1">{shortDate(c.date)}</td>
          <td className={`py-1 text-right ${c.change === null ? '' : c.change > 0 ? 'font-semibold text-good' : 'font-semibold text-risk'}`}>
            {c.change === null ? 'Today' : signed(c.change)}
          </td>
          <td className="py-1 text-right font-semibold">{money(c.balance)}</td>
        </tr>)}</tbody>
      </table>
    </details>
  );
  if (width === null || width <= 0) return <div ref={box} className="forecast-chart">{summary}<div className="forecast-plot" style={{ height: H }} />{table}</div>;

  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const rawLow = Math.min(...values, 0);
  const rawHigh = Math.max(...values, showBuffer ? BUFFER : 100);
  const step = niceStep(rawHigh - rawLow);
  const lo = Math.floor(rawLow / step) * step;
  const hi = Math.ceil((rawHigh + step * 0.25) / step) * step;
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * plotH;
  const x = (i: number) => M.left + (i / (points.length - 1)) * plotW;

  const yTicks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) yTicks.push(Math.round(t));
  const compact = Math.max(Math.abs(lo), Math.abs(hi)) >= 1_000_000;
  const intervals = plotW < 220 ? 1 : plotW < 500 ? 2 : 4;
  const xTicks = [...new Set(Array.from({ length: intervals + 1 }, (_, i) => Math.round(i * (points.length - 1) / intervals)))];

  let line = `M${x(0)},${y(values[0])}`;
  for (let i = 1; i < values.length; i++) line += `H${x(i)}V${y(values[i])}`;
  const area = `${line}V${y(lo)}H${x(0)}Z`;

  const lowX = x(lowIndex), lowY = y(low.balance);
  const shownX = x(shown);

  const readPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((e.clientX - left - M.left) / plotW) * (points.length - 1));
    const index = Math.max(0, Math.min(points.length - 1, i));
    setHover(index);
    if (e.type === 'pointerdown' || e.type === 'pointerup') setSelectedDate(points[index].date);
  };

  return (
    <div ref={box} className="forecast-chart">
      {summary}
      <div className="forecast-plot">
        <svg
          width={width} height={H} role="img" aria-label={label} className="block touch-pan-y"
          onPointerMove={readPointer} onPointerDown={readPointer} onPointerUp={readPointer} onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--pnc-blue)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--pnc-blue)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {showBuffer && <rect x={M.left} y={y(BUFFER)} width={plotW} height={y(0) - y(BUFFER)} fill="var(--watch)" opacity="0.08" />}
          {lo < 0 && <rect x={M.left} y={y(0)} width={plotW} height={y(lo) - y(0)} fill="var(--risk)" opacity="0.07" />}
          {yTicks.map((t) => <g key={t}>
            {t !== 0 && <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />}
            <text x={M.left - 10} y={y(t) + 4} textAnchor="end" style={TEXT}>{axisLabel(t, compact)}</text>
          </g>)}
          {xTicks.map((i) => <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} style={TEXT}>{shortDate(points[i].date)}</text>)}

          <path d={area} fill={`url(#${id}-fill)`} />
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke={lo < 0 ? 'var(--risk)' : 'var(--border)'} strokeWidth="1.5" />
          {showBuffer && <line x1={M.left} x2={width - M.right} y1={y(BUFFER)} y2={y(BUFFER)} stroke="var(--watch)" strokeWidth="1.5" strokeDasharray="6 5" />}
          <path d={line} fill="none" stroke="var(--pnc-blue)" strokeWidth="10" strokeOpacity="0.07" strokeLinejoin="round" />
          <path d={line} fill="none" stroke="var(--pnc-blue)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          {showBuffer && <text x={width - M.right - 2} y={y(BUFFER) - 6} textAnchor="end" style={{ ...TEXT, ...HALO }}>$200 buffer</text>}

          <circle cx={x(0)} cy={y(values[0])} r="4" fill="var(--paper)" stroke="var(--pnc-blue)" strokeWidth="2" />
          <circle cx={x(points.length - 1)} cy={y(end.balance)} r="4" fill="var(--paper)" stroke="var(--pnc-blue)" strokeWidth="2" />
          <circle cx={lowX} cy={lowY} r="5" fill={lowColor} stroke="var(--paper)" strokeWidth="2" />
          <line x1={shownX} x2={shownX} y1={M.top} y2={H - M.bottom} stroke="var(--pnc-blue)" strokeOpacity="0.4" strokeDasharray="4 4" />
          <circle cx={shownX} cy={y(active.balance)} r="12" fill="var(--pnc-blue)" fillOpacity="0.12" />
          <circle cx={shownX} cy={y(active.balance)} r="5.5" fill={shown === lowIndex ? lowColor : 'var(--pnc-blue)'} stroke="var(--paper)" strokeWidth="2.5" />
        </svg>
      </div>
      <div className="forecast-explorer">
        <div className="forecast-readout">
          <label htmlFor={`${id}-day`}>
            <span className="forecast-stat-label">Balance on {shortDate(active.date)}</span>
            <strong className="forecast-readout-amount">{money(active.balance)}</strong>
          </label>
          <span className="forecast-day-change">
            {change === null ? 'Starting balance' : change === 0 ? 'No change that day' : `${signed(change)} that day`}
          </span>
        </div>
        <input id={`${id}-day`} className="forecast-slider" type="range" min={0} max={points.length - 1} step={1} value={shown}
          aria-label="Explore daily projected balances" aria-valuetext={`${shortDate(active.date)}: ${money(active.balance)}`}
          onChange={(e) => { setSelectedDate(points[Number(e.target.value)].date); setHover(null); }} />
        <p className="forecast-hint">Drag to explore each day</p>
      </div>
      {table}
    </div>
  );
}
