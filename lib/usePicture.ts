'use client';

// Loads FinancialPictures from /api/picture (Nessie, or local.json offline).
// Results are kept in memory so switching pages or people doesn't refetch.

import { useEffect, useState } from 'react';
import type { FinancialPicture } from './types';

export type PictureState =
  | { status: 'loading' }
  | { status: 'ready'; picture: FinancialPicture | null; source: string }
  | { status: 'error' };

const cache = new Map<string, PictureState>();
const inflight = new Map<string, Promise<void>>();

function fetchPicture(memberId: string): Promise<void> {
  const existing = inflight.get(memberId);
  if (existing) return existing;
  const p = fetch(`/api/picture?member=${encodeURIComponent(memberId)}`)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then((data: { picture: FinancialPicture | null; source: string }) => {
      cache.set(memberId, { status: 'ready', picture: data.picture, source: data.source });
    })
    .catch(() => {
      cache.set(memberId, { status: 'error' });
    })
    .finally(() => inflight.delete(memberId));
  inflight.set(memberId, p);
  return p;
}

/** Forget a cached picture after it changed (e.g. a purchase was saved), so pages refetch it. */
export function invalidatePicture(memberId: string) {
  cache.delete(memberId);
}

/** One person's picture. */
export function usePicture(memberId: string): PictureState {
  return usePictures([memberId])[memberId];
}

/** Several people's pictures (e.g. the household carousel or a huddle's fair split). */
export function usePictures(memberIds: string[]): Record<string, PictureState> {
  const key = memberIds.join(',');
  const [, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const missing = key.split(',').filter((id) => id && !cache.has(id));
    if (missing.length === 0) return;
    Promise.all(missing.map(fetchPicture)).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return Object.fromEntries(memberIds.map((id) => [id, cache.get(id) ?? { status: 'loading' }]));
}
