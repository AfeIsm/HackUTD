'use client';

import { SHARING_OPTIONS, type SharingScope, type SharingSettings } from '@/lib/household-sharing';
import { Card } from './ui';

export function HouseholdSharing({ settings, saving, onToggle }: {
  settings: SharingSettings; saving: SharingScope | null; onToggle: (scope: SharingScope, enabled: boolean) => void;
}) {
  return <Card label="Your household sharing" className="flex flex-col gap-3">
    <h2 className="m-0 text-[22px]">What I share with my household</h2>
    <p className="m-0 text-sm text-ink-2">Only selected categories are visible to other accepted members, including the owner. Changes save automatically. Your own view always shows your data.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {SHARING_OPTIONS.map(({ key, label, detail }) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
        <input type="checkbox" role="switch" checked={settings[key]} disabled={saving !== null}
          onChange={(e) => onToggle(key, e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-accent" />
        <span className="flex flex-col gap-1"><strong className="text-sm">{label}{saving === key ? ' · Saving…' : ''}</strong><span className="text-xs text-muted">{detail}</span></span>
      </label>)}
    </div>
  </Card>;
}
