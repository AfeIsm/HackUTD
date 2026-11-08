'use client';

// The person the app is showing = the logged-in user (from the session), not a dropdown.
// Pages under <SessionGate> can rely on viewerId being a real member with money data.

import { useMe } from './useMe';
import { PEOPLE, lookOf, type Person } from './people';

export function useViewer() {
  const me = useMe();
  const viewerId = me.status === 'in' ? (me.user.memberId ?? '') : '';
  const name = me.status === 'in' ? me.user.name : '';
  const person: Person = PEOPLE.find((p) => p.id === viewerId) ?? {
    id: viewerId, name, role: 'self', roleLabel: 'Account owner',
    ...lookOf(name, viewerId), hasAccounts: Boolean(viewerId), goals: [],
  };
  return { viewerId, me, person };
}
