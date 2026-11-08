'use client';

// Private advice on a pledge that failed its health check: Nemotron's words, the engine's numbers.

import type { Participant } from '@/lib/huddles';
import type { PledgeAdvice } from '@/lib/engine/pledgeAdvice';
import { money0, shortDate } from '@/lib/format';
import { Eyebrow, btn } from './ui';

export function PledgeCoach({ mine, advice, busy, onPledge }: {
  mine: Participant; advice: PledgeAdvice; busy: boolean; onPledge: (amount: number) => void;
}) {
  const coach = mine.coach;
  const cuts = advice.cuts.filter((c) => !coach?.actions.some((a) => a.startsWith(c.label))); // no repeats of Nemotron's list
  const paycheckLine = advice.perPaycheck !== null && advice.nextPayday
    ? ` That’s about ${money0(advice.perPaycheck)} from each of your ${advice.paychecksLeft} ${advice.paychecksLeft === 1 ? 'paycheck' : 'paychecks'} before then, starting ${shortDate(advice.nextPayday)}.`
    : '';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-4">
      <Eyebrow>Nemotron’s advice</Eyebrow>
      {coach ? (
        <div className="flex flex-col gap-1.5">
          <strong className="text-[17px] leading-snug">{coach.headline}</strong>
          {coach.actions.length > 0 && coach.verdict !== 'yesIf' && (
            <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm">{coach.actions.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {coach.explanation && <p className="m-0 text-[15px] leading-normal text-ink-2">{coach.explanation}</p>}
          {coach.firstStep && <p className="m-0 text-sm"><b>First step:</b> {coach.firstStep}</p>}
        </div>
      ) : mine.coachState === 'thinking' ? (
        <p className="m-0 text-sm text-ink-2" aria-live="polite">Nemotron is reading your spending, bills and paychecks…</p>
      ) : (
        <p className="m-0 text-sm text-ink-2">Nemotron couldn’t finish, but these numbers are ready.</p>
      )}

      <div className="flex flex-col gap-1">
        <strong className="text-sm">How much to save</strong>
        {advice.notGreenNow ? (
          <p className="m-0 text-sm leading-normal text-ink-2">Your health score isn’t green yet, so any pledge adds risk. Getting to green first is safer.</p>
        ) : advice.safeToday > 0 ? (
          <p className="m-0 text-sm leading-normal text-ink-2">You can safely pledge {money0(advice.safeToday)} today.</p>
        ) : (
          <p className="m-0 text-sm leading-normal text-ink-2">This account can’t safely cover any of it today.</p>
        )}
        <p className="m-0 text-sm leading-normal text-ink-2">
          To reach {money0(advice.amount)} by {shortDate(advice.targetDate)}, save <b className="text-ink">{money0(advice.weeklyToSave)} a week</b>.{paycheckLine}
        </p>
        {advice.weeklyToSave > advice.weeklyLeftover ? (
          <p className="m-0 text-sm leading-normal text-bad">
            After bills and your usual spending you have about {money0(advice.weeklyLeftover)} a week left, so this needs real cuts.
          </p>
        ) : (
          <p className="m-0 text-sm leading-normal text-ink-2">
            After bills and your usual spending you have about {money0(advice.weeklyLeftover)} a week left, so this fits your budget.
          </p>
        )}
      </div>

      {cuts.length > 0 && (
        <div className="flex flex-col gap-1">
          <strong className="text-sm">{cuts.length < advice.cuts.length ? 'Also worth cutting' : 'What to cut'}</strong>
          <ul className="m-0 flex list-none flex-col p-0">
            {cuts.map((c) => (
              <li key={c.label} className="flex justify-between gap-3 py-0.5 text-sm">
                <span>{c.label}</span>
                <span className="font-semibold">{money0(c.weekly)}/week</span>
              </li>
            ))}
          </ul>
          {!advice.cutsCover && advice.weeklyToSave > advice.weeklyLeftover && <p className="m-0 text-[13px] text-muted">These alone don’t cover it. Consider a smaller pledge or ask to move the date.</p>}
        </div>
      )}

      {advice.safeToday > 0 && (
        <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => onPledge(advice.safeToday)}>
          Pledge {money0(advice.safeToday)} instead
        </button>
      )}
    </div>
  );
}
