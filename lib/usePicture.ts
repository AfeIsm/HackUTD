'use client';

// Subscribe to the shared cache so asynchronous results remain reactive under
// the React compiler. Identity switching reuses an unchanged loaded picture.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { FinancialPicture } from './types';
export type PictureState =
  | { status: 'loading' }
  | { status: 'ready'; picture: FinancialPicture | null; source: string }
  | { status: 'error' };
let snapshot: Record<string, PictureState> = {};
const emptySnapshot: Record<string, PictureState> = {};
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => emptySnapshot;
function publish(memberId: string, state: PictureState) {
  snapshot = { ...snapshot, [memberId]: state };
  listeners.forEach((listener) => listener());
}
function fetchPicture(memberId: string): Promise<void> {
  const existing = inflight.get(memberId);
  if (existing) return existing;
  const request = fetch(`/api/picture?member=${encodeURIComponent(memberId)}`)
    .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
    .then((data: { picture: FinancialPicture | null; source: string }) => publish(memberId, { status: 'ready', picture: data.picture, source: data.source }))
    .catch(() => publish(memberId, { status: 'error' }))
    .finally(() => inflight.delete(memberId));
  inflight.set(memberId, request);
  return request;
}
/** Refetch a member's picture after it changed (e.g. a purchase was saved), so every page updates. */
export function invalidatePicture(memberId: string) {
  const next = { ...snapshot };
  delete next[memberId];
  snapshot = next;
  listeners.forEach((listener) => listener());
  void fetchPicture(memberId);
}
export function usePicture(memberId: string): PictureState { return usePictures([memberId])[memberId]; }
export function usePictures(memberIds: string[]): Record<string, PictureState> {
  const key = memberIds.join(',');
  const currentSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { key.split(',').filter((id) => id && !snapshot[id]).forEach((id) => { void fetchPicture(id); }); }, [key]);
  return useMemo(() => {
    return Object.fromEntries(key.split(',').filter(Boolean).map((id) => [id, currentSnapshot[id] ?? { status: 'loading' }]));
  }, [key, currentSnapshot]);
}
