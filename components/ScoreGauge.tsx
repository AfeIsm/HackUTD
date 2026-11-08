import type { Status } from '@/lib/types';
import { TONE } from './ui';

const R = 70;
const C = 2 * Math.PI * R;

export function ScoreGauge({ score, status, size = 168 }: { score: number; status: Status; size?: number }) {
  const dash = `${((C * score) / 100).toFixed(1)} ${C.toFixed(1)}`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 168 168" role="img" aria-label={`Health score ${score} out of 100, ${TONE[status].label}`}>
        <circle cx="84" cy="84" r={R} fill="none" stroke="#ECECE7" strokeWidth="14" />
        <circle
          cx="84" cy="84" r={R} fill="none" stroke={TONE[status].ring} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={dash} transform="rotate(-90 84 84)" style={{ transition: 'stroke-dasharray 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-display text-[54px] font-bold leading-none">{score}</span>
        <span className="text-[13px] text-muted">out of 100</span>
      </div>
    </div>
  );
}
