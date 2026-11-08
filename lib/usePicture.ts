'use client';

// Loads a member's FinancialPicture from /api/picture (Nessie, or local.json offline).
// Results are kept in memory so switching pages or people back and forth doesn't refetch.

import { useEffect, useState } from 'react';
import type { FinancialPicture } from './types';

export type PictureState =
  | { status: 'loading' }
  | { status: 'ready'; picture: FinancialPicture | null; source: string }
  | { status: 'error' };

const cache = new Map<string, PictureState>();

export function usePicture(memberId: string): PictureState {
  const [state, setState] = useState<{ id: string; value: PictureState } | null>(null);

  useEffect(() => {
    if (cache.has(memberId)) return;
    let alive = true;
    fetch(`/api/picture?member=${encodeURIComponent(memberId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { picture: FinancialPicture | null; source: string }) => {
        const value: PictureState = { status: 'ready', picture: data.picture, source: data.source };
        cache.set(memberId, value);
        if (alive) setState({ id: memberId, value });
      })
      .catch(() => {
        if (alive) setState({ id: memberId, value: { status: 'error' } });
      });
    return () => {
      alive = false;
    };
  }, [memberId]);

  const cached = cache.get(memberId);
  if (cached) return cached;
  return state?.id === memberId ? state.value : { status: 'loading' };
}
