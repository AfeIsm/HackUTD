// One person in a list: avatar, name, @username (or a note), and something on the right.

import type { ReactNode } from 'react';
import type { PersonRef } from '@/lib/types';
import { lookOf } from '@/lib/people';
import { Avatar } from './ui';

export function PersonRow({ person, note, right, you }: { person: PersonRef; note?: string; right?: ReactNode; you?: boolean }) {
  const look = lookOf(person.name, person.memberId);
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#EFEFEA] py-3.5">
      <Avatar initial={look.initial} color={look.color} />
      <div className="flex min-w-0 flex-[1_1_160px] flex-col">
        <span className="font-semibold">
          {person.name}
          {you ? ' (you)' : ''}
        </span>
        <span className="text-[13px] text-muted">{note ?? (person.username ? `@${person.username}` : 'No login')}</span>
      </div>
      {right}
    </div>
  );
}
