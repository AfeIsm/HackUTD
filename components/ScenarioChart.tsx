'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { BuyScenario } from './buyScenarios';
import { addDays, daysBetween, toDayNumber } from '../lib/engine/dates';
import { money, money0, shortDate } from '../lib/format';

export const SCENARIO_COLORS = { now: 'var(--pnc-blue)', payday: 'var(--watch)', cheaper: 'var(--note-ink)' };
const DASH = { now: undefined, payday: '8 4', cheaper: '2 4' };
const H = 235, LEFT = 70, RIGHT = 18, TOP = 16, BOTTOM = 32;

export function ScenarioChart({ scenarios }: { scenarios: BuyScenario[] }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [day, setDay] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const series = scenarios.filter((s) => s.points.length > 1);
  if (!series.length) return <p className="buy-compare-chart-note">Add the missing account details to see the forecasts.</p>;
  const start = series.map((s) => s.points[0].date).sort()[0];
  const end = series.map((s) => s.points.at(-1)!.date).sort().at(-1)!;
  const days = Math.max(1, daysBetween(start, end));
  const values = series.flatMap((s) => s.points.map((p) => p.balance));
  const min = Math.min(...values, 0), max = Math.max(...values, 100);
  const rough = (max - min) / 4, mag = 10 ** Math.floor(Math.log10(rough));
  const step = (rough / mag <= 2 ? 2 : rough / mag <= 5 ? 5 : 10) * mag;
  const low = Math.floor(min / step) * step, high = Math.ceil((max + step * .15) / step) * step;
  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const x = (date: string) => LEFT + (toDayNumber(date) - toDayNumber(start)) / days * plotWidth;
  const y = (value: number) => TOP + (high - value) / (high - low) * (H - TOP - BOTTOM);
  const activeDay = Math.min(day, days), date = addDays(start, activeDay);
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);
  const intervals = width < 460 ? 2 : 4;
  const dateTicks = [...new Set(Array.from({ length: intervals + 1 }, (_, i) => addDays(start, Math.round(days * i / intervals))))];
  const readout = series.map((s) => ({ scenario: s, point: s.points.find((p) => p.date === date) }));
  const valueText = `${shortDate(date)}: ${readout.map(({ scenario, point }) => `${scenario.title} ${point ? money(point.balance) : 'forecast ended'}`).join('; ')}`;

  return <div ref={box}>
    <div className="buy-compare-legend" aria-label="Scenario colors">
      {scenarios.map((s) => <span key={s.id} style={{ '--scenario-color': SCENARIO_COLORS[s.id] } as CSSProperties}>
        <svg width="24" height="8" aria-hidden="true"><path d="M0 4H24" stroke={SCENARIO_COLORS[s.id]} strokeWidth="3" strokeDasharray={DASH[s.id]} /></svg>
        {s.title}{s.points.length < 2 ? ' · unavailable' : ''}
      </span>)}
    </div>
    <div className="buy-compare-plot">
      <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" aria-label="Projected account balances for all available purchase scenarios. Blue solid: buy as planned; amber dashed: wait for payday; green dotted: buy cheaper."
        onPointerMove={(e) => { const left = e.currentTarget.getBoundingClientRect().left; setDay(Math.max(0, Math.min(days, Math.round((e.clientX - left - LEFT) / plotWidth * days)))); }}>
        {ticks.map((v) => <g key={v}><line x1={LEFT} x2={width - RIGHT} y1={y(v)} y2={y(v)} stroke={v === 0 && low < 0 ? 'var(--risk)' : 'var(--border)'} strokeDasharray={v === 0 ? undefined : '3 5'} /><text x={LEFT - 9} y={y(v) + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{money0(v)}</text></g>)}
        {dateTicks.map((d, i) => <text key={d} x={x(d)} y={H - 10} textAnchor={i === 0 ? 'start' : i === dateTicks.length - 1 ? 'end' : 'middle'} fill="var(--muted-foreground)" fontSize="11">{shortDate(d)}</text>)}
        {series.map((s) => {
          let path = `M${x(s.points[0].date)},${y(s.points[0].balance)}`;
          for (const p of s.points.slice(1)) path += `H${x(p.date)}V${y(p.balance)}`;
          const last = s.points.at(-1)!;
          return <g key={s.id} data-scenario={s.id}><path d={path} fill="none" stroke={SCENARIO_COLORS[s.id]} strokeWidth="2.75" strokeDasharray={DASH[s.id]} strokeLinejoin="round" strokeLinecap="round" /><circle cx={x(last.date)} cy={y(last.balance)} r="4" fill={SCENARIO_COLORS[s.id]} stroke="var(--paper)" strokeWidth="1.5" /></g>;
        })}
        <line x1={x(date)} x2={x(date)} y1={TOP} y2={H - BOTTOM} stroke="var(--muted-foreground)" strokeDasharray="3 4" opacity=".6" />
        {readout.map(({ scenario, point }) => point && <circle key={scenario.id} cx={x(date)} cy={y(point.balance)} r="4.5" fill={SCENARIO_COLORS[scenario.id]} stroke="var(--paper)" strokeWidth="1.5" />)}
      </svg>
    </div>
    <div className="buy-compare-readout"><time dateTime={date}>{shortDate(date)}</time>{readout.map(({ scenario, point }) => <span key={scenario.id} style={{ color: SCENARIO_COLORS[scenario.id] }}>{scenario.title}: <strong>{point ? money(point.balance) : 'Forecast ended'}</strong></span>)}</div>
    <label htmlFor={`${id}-day`} className="sr-only">Explore all scenario balances by date</label>
    <input id={`${id}-day`} type="range" min={0} max={days} value={activeDay} step={1} className="buy-compare-slider" aria-valuetext={valueText} onChange={(e) => setDay(Number(e.target.value))} />
    <p className="buy-compare-chart-note">Drag to compare the same day. Each forecast ends thirty days after its purchase.</p>
  </div>;
}
