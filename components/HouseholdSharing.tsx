'use client';

import { SHARING_OPTIONS, type SharingScope, type SharingSettings } from '@/lib/household-sharing';

const LABELS: Record<SharingScope, string> = {
  balances: 'Balances', income: 'Income', obligations: 'Bills & loans',
  goals: 'Savings goals', transactions: 'Transactions', health: 'Health score',
};

export function HouseholdSharing({ settings, saving, onToggle }: {
  settings: SharingSettings; saving: SharingScope | null; onToggle: (scope: SharingScope, enabled: boolean) => void;
}) {
  return <section aria-label="Your household sharing" className="household-sharing min-w-0">
    <h2 className="section-title font-display">What I share</h2>
    <p className="mt-2 text-sm text-muted-foreground">Choose what your household can see. Saves automatically.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {SHARING_OPTIONS.map(({ key }) => <label key={key} className="share-option items-center">
        <input type="checkbox" role="switch" checked={settings[key]} disabled={saving !== null}
          onChange={(e) => onToggle(key, e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-accent" />
        <span className="font-semibold">{LABELS[key]}{saving === key ? ' · Saving…' : ''}</span>
      </label>)}
    </div>
  </section>;
}
