'use client';

// Projected balance as a step line: a balance holds until the day it changes.
// Hover, tap or arrow keys read any day; the table underneath has the same numbers.

import { useEffect, useRef, useState } from 'react';
import type { ForecastPoint } from '@/lib/types';
import { money, shortDate } from '@/lib/format';

const H = 260;
const M = { top: 18, right: 14, bottom: 30, left: 58 };
const BUFFER = 20_000; // the $200 line the health score uses
const TIP_W = 156;

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

export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

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
  const changes = points.flatMap((p, i) => {
    const change = i === 0 ? null : p.balance - points[i - 1].balance;
    return i === 0 || change !== 0 ? [{ ...p, change }] : [];
  });
  const label = `Projected checking balance over ${points.length - 1} days. Lowest ${money(low.balance)} on ${shortDate(low.date)}. Use the left and right arrow keys to read each day.`;

  const summary = (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
      <span>Lowest: <strong>{money(low.balance)} on {shortDate(low.date)}</strong></span>
      <span>{shortDate(end.date)}: <strong>{money(end.balance)}</strong></span>
    </div>
  );
  const table = (
    <details className="text-[13px] text-ink-2">
      <summary className="cursor-pointer">See every balance change</summary>
      <table className="mt-2 w-full border-collapse tabular-nums">
        <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Change</th><th className="py-1 text-right font-medium">Balance</th></tr></thead>
        <tbody>{changes.map((c) => <tr key={c.date} className="border-t border-line">
          <td className="py-1">{shortDate(c.date)}</td>
          <td className="py-1 text-right">{c.change === null ? 'Today' : signed(c.change)}</td>
          <td className="py-1 text-right font-semibold">{money(c.balance)}</td>
        </tr>)}</tbody>
      </table>
    </details>
  );
  if (width === null || width <= 0) return <div ref={box} className="flex flex-col gap-3"><div style={{ height: H }} />{summary}{table}</div>;

  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const rawLow = Math.min(...values, 0);
  const rawHigh = Math.max(...values, BUFFER);
  const step = niceStep(rawHigh - rawLow);
  const lo = Math.floor(rawLow / step) * step;
  const hi = Math.ceil(rawHigh / step) * step;
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * plotH;
  const x = (i: number) => M.left + (i / (points.length - 1)) * plotW;

  const yTicks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) yTicks.push(Math.round(t));
  const compact = Math.max(Math.abs(lo), Math.abs(hi)) >= 1_000_000;
  const xEvery = plotW < 380 ? 14 : 7;
  const xTicks = points.map((_, i) => i).filter((i) => i % xEvery === 0);

  let line = `M${x(0)},${y(values[0])}`;
  for (let i = 1; i < values.length; i++) line += `H${x(i)}V${y(values[i])}`;
  const area = `${line}V${y(0)}H${x(0)}Z`;

  const lowX = x(lowIndex), lowY = y(low.balance);
  const lowBelow = lowY + 22 <= H - M.bottom - 2;
  const lowOnRight = lowX > M.left + plotW * 0.6;
  const shown = hover !== null && points[hover] ? hover : null;
  const shownX = shown === null ? 0 : x(shown);
  const shownChange = shown === null || shown === 0 ? null : points[shown].balance - points[shown - 1].balance;
  const tipLeft = shownX + 12 + TIP_W > width ? shownX - 12 - TIP_W : shownX + 12;

  const readPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((e.clientX - left - M.left) / plotW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const readKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const from = shown ?? lowIndex;
    const next = e.key === 'ArrowLeft' ? from - 1 : e.key === 'ArrowRight' ? from + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(points.length - 1, next)));
  };

  return (
    <div ref={box} className="flex flex-col gap-3">
      <div className="relative">
        <svg
          width={width} height={H} role="img" aria-label={label} tabIndex={0} className="block touch-pan-y focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          onPointerMove={readPointer} onPointerDown={readPointer} onPointerLeave={() => setHover(null)}
          onKeyDown={readKey} onFocus={() => setHover(lowIndex)} onBlur={() => setHover(null)}
        >
          {yTicks.map((t) => <g key={t}>
            {t !== 0 && <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />}
            <text x={M.left - 10} y={y(t) + 4} textAnchor="end" style={TEXT}>{axisLabel(t, compact)}</text>
          </g>)}
          {xTicks.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : x(i) > width - 40 ? 'end' : 'middle'} style={TEXT}>{shortDate(points[i].date)}</text>)}

          <path d={area} fill="var(--pnc-blue)" opacity="0.1" />
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--risk)" strokeWidth="1.5" />
          <line x1={M.left} x2={width - M.right} y1={y(BUFFER)} y2={y(BUFFER)} stroke="var(--watch)" strokeWidth="1.5" strokeDasharray="6 5" />
          <path d={line} fill="none" stroke="var(--pnc-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <text x={width - M.right - 2} y={y(BUFFER) - 6} textAnchor="end" style={{ ...TEXT, ...HALO }}>$200 buffer</text>

          <circle cx={lowX} cy={lowY} r="4.5" fill="var(--pnc-blue)" stroke="var(--paper)" strokeWidth="2" />
          {shown === null && <text x={lowOnRight ? lowX - 8 : lowX + 8} y={lowBelow ? lowY + 20 : lowY - 12} textAnchor={lowOnRight ? 'end' : 'start'} style={{ ...TEXT, ...HALO, fill: 'var(--foreground)', fontWeight: 600 }}>
            Lowest {money(low.balance)}
          </text>}

          {shown !== null && <g>
            <line x1={shownX} x2={shownX} y1={M.top} y2={H - M.bottom} stroke="var(--muted-foreground)" strokeWidth="1" />
            <circle cx={shownX} cy={y(values[shown])} r="4.5" fill="var(--pnc-blue)" stroke="var(--paper)" strokeWidth="2" />
          </g>}
        </svg>
        {shown !== null && (
          <div role="status" className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-md" style={{ left: tipLeft, width: TIP_W }}>
            <strong className="block text-[15px] tabular-nums">{money(values[shown])}</strong>
            <span className="block text-muted">{shortDate(points[shown].date)}{shown === 0 ? ' · today' : ''}</span>
            {shownChange !== null && shownChange !== 0 && <span className="block tabular-nums">{signed(shownChange)} that day</span>}
          </div>
        )}
      </div>
      {summary}
      {table}
    </div>
  );
}
