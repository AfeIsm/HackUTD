'use client';

// Browser side of "Apply this plan" / "Undo". Returns the fresh health check, or an error.

import type { HealthPayload } from './services/health';

export type ApplyResult = { ok: true; payload: HealthPayload; note: string } | { ok: false; error: string };

export async function applyPlan(body: { cancel: string[]; moveSavingsToChecking: number | null }, method: 'POST' | 'DELETE' = 'POST'): Promise<ApplyResult> {
  try {
    const res = await fetch('/api/plan/apply', {
      method, headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ cancel: body.cancel, moveSavingsToChecking: body.moveSavingsToChecking ?? undefined }) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as HealthPayload & { error?: string; applied?: { note: string } };
    if (!res.ok) return { ok: false, error: data.error ?? `Something went wrong (${res.status}).` };
    return { ok: true, payload: data, note: data.applied?.note ?? 'Undone. Your score was re-checked.' };
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Try again.' };
  }
}
