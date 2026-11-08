'use client';

import { SHARING_OPTIONS, type SharingScope, type SharingSettings } from '@/lib/household-sharing';

export function HouseholdSharing({ settings, saving, onToggle }: {
  settings: SharingSettings; saving: SharingScope | null; onToggle: (scope: SharingScope, enabled: boolean) => void;
}) {
  return <section aria-label="Your household sharing" className="household-sharing min-w-0">
    <h2 className="section-title font-display">What I share with my household</h2>
    <p className="mt-2 text-muted-foreground">Only selected categories are visible to other accepted members, including the owner. Changes save automatically. Your own view always shows your data.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {SHARING_OPTIONS.map(({ key, label, detail }) => <label key={key} className="share-option">
        <input type="checkbox" role="switch" checked={settings[key]} disabled={saving !== null}
          onChange={(e) => onToggle(key, e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-accent" />
        <span className="flex flex-col gap-1"><strong className="font-semibold">{label}{saving === key ? ' · Saving…' : ''}</strong><span className="text-sm text-muted-foreground">{detail}</span></span>
      </label>)}
    </div>
  </section>;
}
