'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { HouseholdPayload, SharingScope } from './household-sharing';

export function useHousehold(membershipKey: string) {
  const [data, setData] = useState<HouseholdPayload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<SharingScope | null>(null);
  const version = useRef(0);
  const savingRef = useRef(false);
  const loadingRef = useRef(false);
  const invalidate = useCallback(() => { version.current++; }, []);
  const refresh = useCallback(async () => {
    if (savingRef.current || loadingRef.current) return;
    loadingRef.current = true;
    const request = ++version.current;
    try {
      const response = await fetch('/api/household', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not refresh household sharing.');
      const next = await response.json() as HouseholdPayload;
      if (request === version.current) { setData(next); setError(''); }
    } catch {
      // Clear previously shared values if permissions cannot be refreshed.
      if (request === version.current) { setData(null); setError('Could not refresh household sharing. Try again.'); }
    } finally { loadingRef.current = false; }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 5000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { invalidate(); clearTimeout(first); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [membershipKey, refresh, invalidate]);

  async function toggle(scope: SharingScope, enabled: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    version.current++;
    setSaving(scope);
    setError('');
    try {
      const response = await fetch('/api/household', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, enabled }) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Could not update sharing.');
      setData((old) => old ? { ...old, settings: next.settings } : old);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update sharing.');
    } finally { setSaving(null); savingRef.current = false; }
  }
  const clear = () => { version.current++; setData(null); setError(''); };
  return { data, error, saving, toggle, refresh, clear };
}
