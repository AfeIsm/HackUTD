'use client';

// Who is logged in, from GET /api/auth/me (the server reads the session cookie).
// Fetched once per page load and shared by every component.

import { useEffect, useSyncExternalStore } from 'react';
import type { PublicUser } from './types';

export type MeState = { status: 'loading' } | { status: 'in'; user: PublicUser } | { status: 'out' } | { status: 'error' };

const LOADING: MeState = { status: 'loading' };
let state: MeState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function publish(next: MeState) {
  state = next;
  listeners.forEach((l) => l());
}

function load() {
  started = true;
  fetch('/api/auth/me')
    .then(async (res) => {
      if (res.status === 401) return publish({ status: 'out' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { user: PublicUser };
      publish({ status: 'in', user: data.user });
    })
    .catch(() => publish({ status: 'error' }));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useMe(): MeState {
  const me = useSyncExternalStore(subscribe, () => state, () => LOADING);
  useEffect(() => {
    if (!started) load();
  }, []);
  return me;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  // Full reload on purpose: wipes the previous user's cached data from memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
}
