'use client';

// My huddles (privacy-filtered by the server) from GET /api/huddles, shared by every page.
// Polls every 5s + on window focus so pledges, reveals and invites from other devices show up.

import { useSyncExternalStore } from 'react';
import type { HuddleClientView } from './huddles';

export type HuddlesState = { status: 'loading' } | { status: 'ready'; huddles: HuddleClientView[] } | { status: 'error' };

const LOADING: HuddlesState = { status: 'loading' };
const POLL_MS = 5000;
let state: HuddlesState = LOADING;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
let revision = 0;
let refreshId = 0;

function publish(next: HuddlesState) {
  state = next;
  listeners.forEach((l) => l());
}

export function refreshHuddles(): Promise<void> {
  const atRevision = revision;
  const requestId = ++refreshId;
  return fetch('/api/huddles')
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { huddles: HuddleClientView[] };
      if (atRevision === revision && requestId === refreshId) publish({ status: 'ready', huddles: data.huddles });
    })
    .catch(() => {
      if (state.status !== 'ready') publish({ status: 'error' });
    });
}

const onFocus = () => void refreshHuddles();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshHuddles();
    timer = setInterval(() => void refreshHuddles(), POLL_MS);
    window.addEventListener('focus', onFocus);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener('focus', onFocus);
    }
  };
}

export function useHuddles(): HuddlesState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** POST to /api/huddles or /api/huddles/:id. Stores the fresh list; returns { error } or the response body. */
export async function huddleRequest(url: string, body: Record<string, unknown>): Promise<{ error: string | null; id?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { huddles?: HuddleClientView[]; error?: string; id?: string };
    if (!res.ok) return { error: data.error ?? `Something went wrong (${res.status}).` };
    if (data.huddles) {
      revision++; // Older polling responses must not resurrect a deleted/left huddle.
      publish({ status: 'ready', huddles: data.huddles });
    }
    return { error: null, id: data.id };
  } catch {
    return { error: 'Couldn’t reach the server. Try again.' };
  }
}

export const huddleAction = (id: string, body: Record<string, unknown>) => huddleRequest(`/api/huddles/${encodeURIComponent(id)}`, body);
