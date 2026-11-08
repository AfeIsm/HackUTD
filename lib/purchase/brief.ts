// Validate what the creator typed. The server trusts nothing from the browser.
import { validDate } from '../engine/validation';
import type { ChoiceMode, PurchaseBrief, PurchaseCategory } from './types';

const CATEGORIES: PurchaseCategory[] = ['product', 'rental', 'trip'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const orNull = (s: string) => s || null;
const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function safeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

/** `raw` absent means an ordinary huddle with no purchase attached. */
export function parseBrief(raw: unknown, asOf: string): { brief: PurchaseBrief | null } | { error: string } {
  if (raw === undefined || raw === null) return { brief: null };
  if (typeof raw !== 'object') return { error: 'Purchase details are invalid.' };
  const b = raw as Record<string, unknown>;
  const category = b.category as PurchaseCategory;
  if (!CATEGORIES.includes(category)) return { error: 'Choose what kind of purchase this is.' };
  const description = str(b.description, 200);
  if (description.length < 3) return { error: 'Describe what you want to buy.' };
  const rawUrl = str(b.url, 500);
  const url = safeUrl(rawUrl);
  if (rawUrl && !url) return { error: 'That link doesn’t look like a web address.' };
  const mode = (b.mode === 'exact' ? 'exact' : 'flexible') as ChoiceMode;
  const exactModel = orNull(str(b.exactModel, 120));
  if (mode === 'exact' && !exactModel) return { error: category === 'product' ? 'Exact choice needs the exact model.' : 'Exact choice needs the exact property name.' };
  const f = (b.flexibility ?? {}) as Record<string, unknown>;
  const flexible = mode === 'flexible';
  const brief: PurchaseBrief = {
    category, description, url, mode, exactModel,
    // Exact choice can't substitute anything, whatever the form sent.
    flexibility: {
      alternativeBrands: flexible && f.alternativeBrands === true,
      refurbished: flexible && f.refurbished === true,
      differentDates: flexible && f.differentDates === true,
      nearbyLocations: flexible && f.nearbyLocations === true,
    },
    quantity: 1, condition: b.condition === 'any' ? 'any' : 'new', deliverBy: null,
    location: null, checkIn: null, checkOut: null, guests: null, bedrooms: null, amenities: [],
  };

  if (category === 'product') {
    if (b.quantity !== undefined && b.quantity !== '') {
      const quantity = intIn(b.quantity, 1, 50);
      if (quantity === null) return { error: 'Quantity must be between 1 and 50.' };
      brief.quantity = quantity;
    }
    const deliverBy = str(b.deliverBy, 10);
    if (deliverBy) {
      if (!validDate(deliverBy) || deliverBy < asOf) return { error: 'Pick a delivery date in the future.' };
      brief.deliverBy = deliverBy;
    }
    return { brief };
  }

  const location = str(b.location, 100);
  const checkIn = str(b.checkIn, 10);
  const checkOut = str(b.checkOut, 10);
  if (!location) return { error: 'Where do you want to stay?' };
  if (!validDate(checkIn) || !validDate(checkOut) || checkIn < asOf || checkOut <= checkIn) return { error: 'Pick a valid check-in and check-out date.' };
  const guests = intIn(b.guests, 1, 16);
  if (guests === null) return { error: 'Guests must be between 1 and 16.' };
  let bedrooms: number | null = null;
  if (b.bedrooms !== undefined && b.bedrooms !== '') {
    bedrooms = intIn(b.bedrooms, 0, 12);
    if (bedrooms === null) return { error: 'Bedrooms must be between 0 and 12.' };
  }
  const amenities = (Array.isArray(b.amenities) ? b.amenities : str(b.amenities, 200).split(','))
    .map((a) => str(a, 40)).filter(Boolean).slice(0, 8);
  return { brief: { ...brief, location, checkIn, checkOut, guests, bedrooms, amenities } };
}
