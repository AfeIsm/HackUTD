'use client';

// Friends, household and requests from GET /api/friends, shared by every page.
// Polls every 5s while a page is using it, and refreshes when the window gets focus, so a
// request sent from another device shows up here on its own (no websockets needed).

import { useSyncExternalStore } from 'react';
import type { Connections } from './types';

export type ConnectionsState = { status: 'loading' } | { status: 'ready'; data: Connections } | { status: 'error' };

const LOADING: ConnectionsState = { status: 'loading' };
const POLL_MS = 5000;
let state: ConnectionsState = LOADING;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
let revision = 0;
let refreshId = 0;

function publish(next: ConnectionsState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Store a fresh copy (the POST/PATCH routes return one) or refetch. */
export function setConnections(data: Connections) {
  revision++;
  publish({ status: 'ready', data });
}

export function refreshConnections(): Promise<void> {
  const atRevision = revision;
  const requestId = ++refreshId;
  return fetch('/api/friends')
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Connections;
      if (revision === atRevision && requestId === refreshId) publish({ status: 'ready', data });
    })
    .catch(() => {
      if (state.status !== 'ready') publish({ status: 'error' }); // keep showing old data on a blip
    });
}

const onFocus = () => void refreshConnections();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshConnections();
    timer = setInterval(() => void refreshConnections(), POLL_MS);
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

export function useConnections(): ConnectionsState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** POST/PATCH helper: sends, stores the fresh connections, returns an error message or null. */
export async function sendConnectionChange(url: string, method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Connections & { error?: string };
    if (!res.ok) return data.error ?? `Something went wrong (${res.status}).`;
    setConnections(data);
    return null;
  } catch {
    return 'Couldn’t reach the server. Try again.';
  }
}
