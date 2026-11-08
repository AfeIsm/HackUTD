'use client';

// The person the app is showing = the logged-in user (from the session), not a dropdown.
// Pages under <SessionGate> can rely on viewerId being a real member with money data.

import { useMe } from './useMe';

export function useViewer() {
  const me = useMe();
  const viewerId = me.status === 'in' ? (me.user.memberId ?? '') : '';
  return { viewerId, me };
}
