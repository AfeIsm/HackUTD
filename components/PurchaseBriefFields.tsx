'use client';

// "What are you buying?" on the new-huddle form. Nothing about flexibility is pre-checked:
// the group has to allow each change explicitly.

import { input } from './ui';

export interface BriefForm {
  category: '' | 'product' | 'rental' | 'trip';
  description: string; url: string; mode: 'exact' | 'flexible'; exactModel: string;
  condition: 'new' | 'any'; quantity: string; deliverBy: string;
  location: string; checkIn: string; checkOut: string; guests: string; bedrooms: string; amenities: string;
  alternativeBrands: boolean; refurbished: boolean; differentDates: boolean; nearbyLocations: boolean;
}

export const EMPTY_BRIEF: BriefForm = {
  category: '', description: '', url: '', mode: 'flexible', exactModel: '', condition: 'new', quantity: '1', deliverBy: '',
  location: '', checkIn: '', checkOut: '', guests: '', bedrooms: '', amenities: '',
  alternativeBrands: false, refurbished: false, differentDates: false, nearbyLocations: false,
};

export function briefPayload(f: BriefForm): Record<string, unknown> | undefined {
  if (!f.category) return undefined;
  const { alternativeBrands, refurbished, differentDates, nearbyLocations, ...rest } = f;
  return { ...rest, flexibility: { alternativeBrands, refurbished, differentDates, nearbyLocations } };
}

const label = 'flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold';

export function PurchaseBriefFields({ value: f, onChange }: { value: BriefForm; onChange: (next: BriefForm) => void }) {
  const set = <K extends keyof BriefForm>(key: K, v: BriefForm[K]) => onChange({ ...f, [key]: v });
  const text = (key: keyof BriefForm, title: string, placeholder: string, type = 'text') => (
    <label className={label}>{title}
      <input className={input} type={type} value={f[key] as string} placeholder={placeholder} onChange={(e) => set(key, e.target.value as never)} />
    </label>
  );
  const allow = (key: 'alternativeBrands' | 'refurbished' | 'differentDates' | 'nearbyLocations', title: string) => (
    <label className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line px-3 text-[15px]">
      <input type="checkbox" className="h-[18px] w-[18px]" checked={f[key]} onChange={(e) => set(key, e.target.checked)} />{title}
    </label>
  );
  const product = f.category === 'product';
  return (
    <fieldset className="m-0 flex flex-col gap-4 rounded-xl border border-line p-4">
      <legend className="px-1.5 text-sm font-semibold">Buying something together? Nemotron can search for it</legend>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Purchase type
        <select className={input} value={f.category} onChange={(e) => set('category', e.target.value as BriefForm['category'])}>
          <option value="">Nothing specific, just split the money</option>
          <option value="product">Product or gift</option>
          <option value="rental">Vacation rental</option>
          <option value="trip">Trip (searches places to stay)</option>
        </select>
      </label>
      {f.category && <>
        <div className="flex flex-wrap gap-4">
          {text('description', 'Description', product ? 'Birthday gift: wireless headphones' : 'Beach house for spring break')}
          {text('url', 'Link (optional)', 'https://…', 'url')}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">How strict is this?</span>
          <div className="flex flex-wrap gap-2">
            {(['exact', 'flexible'] as const).map((m) => (
              <label key={m} className="flex min-h-11 flex-[1_1_220px] items-center gap-2.5 rounded-[10px] border border-line px-3 text-[15px]">
                <input type="radio" name="choice-mode" className="h-[18px] w-[18px]" checked={f.mode === m} onChange={() => set('mode', m)} />
                {m === 'exact' ? 'Exact choice: this one only' : 'Flexible: alternatives are OK'}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {text('exactModel', product ? `Exact model${f.mode === 'exact' ? '' : ' (optional)'}` : `Exact property${f.mode === 'exact' ? '' : ' (optional)'}`, product ? 'Sony WH-1000XM5' : 'Seaside Cottage')}
          {product ? <>
            <label className={label}>Condition
              <select className={input} value={f.condition} onChange={(e) => set('condition', e.target.value as BriefForm['condition'])}>
                <option value="new">New</option><option value="any">Any</option>
              </select>
            </label>
            {text('quantity', 'Quantity', '1')}
            {text('deliverBy', 'Needs to arrive by (optional)', '', 'date')}
          </> : <>
            {text('location', 'Location', 'Galveston, TX')}
            {text('checkIn', 'Check-in', '', 'date')}
            {text('checkOut', 'Check-out', '', 'date')}
            {text('guests', 'Guests', '4')}
            {text('bedrooms', 'Bedrooms (optional)', '2')}
            {text('amenities', 'Amenities (comma separated)', 'Pool, Kitchen')}
          </>}
        </div>
        {f.mode === 'flexible' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">What’s OK to change? Nothing is assumed.</span>
            <div className="flex flex-wrap gap-2">
              {product ? <>{allow('alternativeBrands', 'Other brands')}{allow('refurbished', 'Refurbished')}</> : <>{allow('differentDates', 'Different dates')}{allow('nearbyLocations', 'Nearby locations')}</>}
            </div>
          </div>
        )}
      </>}
    </fieldset>
  );
}
