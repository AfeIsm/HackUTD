// "Your fix plan": the smallest changes that get you to green, from lib/engine/fixplan.ts.
// Every number was re-scored by the engine; the plan is saved per data fingerprint, so the
// same data always shows the same plan.

'use client';

import type { FixPlan, FixStep } from '@/lib/types';
import type { HealthPayload } from '@/lib/services/health';
import { ApplyPlanButton } from './ApplyPlanButton';
import { Card, Eyebrow, StatusPill } from './ui';

const ICON: Record<FixStep['kind'], string> = { cancel: '✂', move: '⇄', save: '↗' };

export function FixPlanCard({ plan, onApplied }: { plan: FixPlan; onApplied: (payload: HealthPayload, note: string) => void }) {
  const cancel = plan.steps.filter((s) => s.kind === 'cancel' && s.obligationKey).map((s) => s.obligationKey!);
  const move = plan.steps.find((s) => s.kind === 'move');
  const applicable = cancel.length > 0 || !!move;
  const improves = plan.scoreAfter !== null && plan.scoreBefore !== null && plan.scoreAfter > plan.scoreBefore;
  return (
    <Card label="Your fix plan" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Your fix plan</Eyebrow>
          <h2 className="m-0 text-xl">{plan.summary}</h2>
        </div>
        {improves && (
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <span>{plan.scoreBefore}</span>
            <StatusPill status={plan.statusBefore} />
            <span aria-hidden="true">→</span>
            <span className="sr-only">to</span>
            <span>{plan.scoreAfter}</span>
            <StatusPill status={plan.statusAfter} />
          </div>
        )}
      </div>
      {plan.steps.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {plan.steps.map((s, i) => (
            <li key={`${s.kind}-${i}`} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-bg text-[16px] text-accent">{ICON[s.kind]}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="text-[16px]">{i + 1}. {s.label}</strong>
                <span className="text-[14px] text-ink-2">{s.detail}</span>
                {s.kind === 'save' && <span className="text-[13px] text-muted">Long-term goal, not counted in the score change above.</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {applicable && improves && <ApplyPlanButton plan={{ cancel, moveSavingsToChecking: move ? move.amount / 100 : null }} onApplied={onApplied} />}
      <p className="m-0 text-xs text-muted">
        Calculated by our scoring engine, not guessed: each step was re-scored before it was suggested. Same data, same plan.
        {plan.stillNotGreen.length > 0 && <> Still not green after this: {plan.stillNotGreen.join(', ')}.</>}
      </p>
    </Card>
  );
}
