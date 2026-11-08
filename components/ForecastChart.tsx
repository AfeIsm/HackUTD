import type { ForecastPoint } from '@/lib/types';
import { money, shortDate } from '@/lib/format';

const W = 600;
const H = 200;

export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const max = Math.max(...values, 40000);
  const min = Math.min(...values, -10000);
  const y = (v: number) => Math.round(10 + ((max - v) / (max - min)) * 180);
  const x = (i: number) => Math.round((i / (points.length - 1)) * W);

  // step line: balance holds until the day it changes
  const path: string[] = [];
  points.forEach((p, i) => {
    if (i > 0) path.push(`${x(i)},${y(points[i - 1].balance)}`);
    path.push(`${x(i)},${y(p.balance)}`);
  });

  const lowIndex = values.indexOf(Math.min(...values));
  const low = points[lowIndex];

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
        aria-label={`Projected checking balance over ${points.length - 1} days. Lowest ${money(low.balance)} on ${shortDate(low.date)}.`}
      >
        <line x1="0" x2={W} y1={y(20000)} y2={y(20000)} stroke="#D48A0C" strokeWidth="1.5" strokeDasharray="6 5" />
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#B4231B" strokeWidth="1.5" />
        <polyline points={path.join(' ')} fill="none" stroke="#1F4FD8" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(lowIndex)} cy={y(low.balance)} r="5" fill="#1F4FD8" />
      </svg>
      <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
        <span>
          Lowest: <strong>{money(low.balance)} on {shortDate(low.date)}</strong>
        </span>
        <span className="text-warn">- - $200 buffer</span>
        <span className="text-bad">— $0</span>
      </div>
    </div>
  );
}
